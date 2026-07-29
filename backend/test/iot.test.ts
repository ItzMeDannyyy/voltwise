// Unit tests for the iot module and the MQTT ingest layer (src/lib/mqtt.ts).
//
// Following the dashboard.test.ts pattern: the shared Prisma client and the
// `mqtt` package are both mocked with jest.unstable_mockModule BEFORE the code
// under test is imported, so no database or broker is touched. The tests drive
// handleMessage with fake topics/payloads and assert ingestion, state
// tracking, relay command publishing, and controller validation.

import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import type { Request, Response, NextFunction } from "express";

type AnyFn = (...args: any[]) => any;

// ---- Mock the Prisma client ------------------------------------------------
const prismaMock = {
  user: {
    findUnique: jest.fn<AnyFn>(),
  },
  energyReading: {
    create: jest.fn<AnyFn>(),
  },
};

jest.unstable_mockModule("../src/lib/prisma.ts", () => ({
  prisma: prismaMock,
}));

// ---- Mock the mqtt package ---------------------------------------------------
// A fake client so initMqtt/publishRelayCommand never open a real connection.
const mqttClientMock = {
  connected: true,
  on: jest.fn<AnyFn>(),
  subscribe: jest.fn<AnyFn>(),
  publish: jest.fn<AnyFn>(),
  end: jest.fn<AnyFn>(),
};

const connectMock = jest.fn<AnyFn>(() => mqttClientMock);

jest.unstable_mockModule("mqtt", () => ({
  default: { connect: connectMock },
  connect: connectMock,
}));

// Import the code under test AFTER registering the mocks (ESM requirement).
const mqttLib = await import("../src/lib/mqtt.ts");
const iotService = await import("../src/modules/iot/iot.service.ts");
const iotController = await import("../src/modules/iot/iot.controller.ts");
const { AppError } = await import("../src/lib/AppError.ts");

const TELEMETRY_TOPIC = "voltwise/esp32-01/telemetry";
const RELAY_STATE_TOPIC = "voltwise/esp32-01/relay/state";
const STATUS_TOPIC = "voltwise/esp32-01/status";

// Minimal fake Express response that records status code + JSON body.
function createRes() {
  const res = {
    statusCode: 0,
    body: null as unknown,
    status: jest.fn<AnyFn>(),
    json: jest.fn<AnyFn>(),
  };
  res.status.mockImplementation((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json.mockImplementation((payload: unknown) => {
    res.body = payload;
    return res;
  });
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  mqttClientMock.connected = true;
  prismaMock.energyReading.create.mockResolvedValue({});
  delete process.env.MQTT_DEVICE_UID;
  delete process.env.MQTT_INGEST_MIN_INTERVAL_MS;
});

describe("publishRelayCommand / setRelay before any broker connection", () => {
  it("throws AppError 503 when no client has been created yet", () => {
    expect(() => mqttLib.publishRelayCommand(true)).toThrow(AppError);
    try {
      mqttLib.publishRelayCommand(true);
    } catch (error) {
      expect((error as InstanceType<typeof AppError>).statusCode).toBe(503);
    }
  });
});

describe("resolveIngestUser + handleMessage (telemetry ingestion)", () => {
  it("returns null and skips inserts when the ingest account does not exist", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const userId = await mqttLib.resolveIngestUser();
    expect(userId).toBeNull();

    await mqttLib.handleMessage(
      TELEMETRY_TOPIC,
      Buffer.from(JSON.stringify({ watts: 100, kwh: 1.5 }))
    );
    expect(prismaMock.energyReading.create).not.toHaveBeenCalled();
  });

  it("stores telemetry as a whole-home reading (deviceId null) for the resolved user", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 7 });
    await mqttLib.resolveIngestUser();

    await mqttLib.handleMessage(
      TELEMETRY_TOPIC,
      Buffer.from(
        JSON.stringify({
          voltage: 230.2,
          current: 0.42,
          watts: 96.5,
          kwh: 1.234,
          frequency: 60,
          powerFactor: 0.98,
          ms: 123456,
        })
      )
    );

    expect(prismaMock.energyReading.create).toHaveBeenCalledTimes(1);
    const createArg = prismaMock.energyReading.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(createArg.data).toMatchObject({
      userId: 7,
      deviceId: null,
      watts: 96.5,
      kwh: 1.234,
      voltage: 230.2,
      current: 0.42,
      frequency: 60,
      powerFactor: 0.98,
    });
    expect(createArg.data.timestamp).toBeInstanceOf(Date);
  });

  it("ignores malformed JSON without throwing or inserting", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 7 });
    await mqttLib.resolveIngestUser();

    await expect(
      mqttLib.handleMessage(TELEMETRY_TOPIC, Buffer.from("{not json"))
    ).resolves.toBeUndefined();
    expect(prismaMock.energyReading.create).not.toHaveBeenCalled();
  });

  it("rejects telemetry with missing or non-numeric watts/kwh", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 7 });
    await mqttLib.resolveIngestUser();

    await mqttLib.handleMessage(
      TELEMETRY_TOPIC,
      Buffer.from(JSON.stringify({ watts: "96.5", kwh: 1.2 }))
    );
    await mqttLib.handleMessage(
      TELEMETRY_TOPIC,
      Buffer.from(JSON.stringify({ voltage: 230 }))
    );
    expect(prismaMock.energyReading.create).not.toHaveBeenCalled();
  });

  it("swallows database failures so the process never crashes", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 7 });
    await mqttLib.resolveIngestUser();
    prismaMock.energyReading.create.mockRejectedValue(new Error("db down"));

    await expect(
      mqttLib.handleMessage(
        TELEMETRY_TOPIC,
        Buffer.from(JSON.stringify({ watts: 10, kwh: 0.1 }))
      )
    ).resolves.toBeUndefined();
  });
});

describe("handleMessage (device state tracking) + getStatus", () => {
  it("tracks relay state from the retained relay/state topic", async () => {
    await mqttLib.handleMessage(
      RELAY_STATE_TOPIC,
      Buffer.from(JSON.stringify({ on: false, reason: "remote" }))
    );

    const state = mqttLib.getIotState();
    expect(state.relay).toMatchObject({ on: false, reason: "remote" });
  });

  it("ignores relay state payloads without a boolean 'on'", async () => {
    await mqttLib.handleMessage(
      RELAY_STATE_TOPIC,
      Buffer.from(JSON.stringify({ on: true, reason: "boot" }))
    );
    await mqttLib.handleMessage(
      RELAY_STATE_TOPIC,
      Buffer.from(JSON.stringify({ on: "yes" }))
    );

    // The malformed second message must not clobber the valid first one.
    expect(mqttLib.getIotState().relay).toMatchObject({
      on: true,
      reason: "boot",
    });
  });

  it("reports online only while telemetry is fresh (stale-retained guard)", async () => {
    jest.useFakeTimers();
    try {
      // Retained "online" alone is not enough — telemetry must be fresh.
      await mqttLib.handleMessage(STATUS_TOPIC, Buffer.from("online"));
      prismaMock.user.findUnique.mockResolvedValue(null);
      await mqttLib.resolveIngestUser();
      await mqttLib.handleMessage(
        TELEMETRY_TOPIC,
        Buffer.from(JSON.stringify({ watts: 50, kwh: 0.5 }))
      );

      expect(iotService.getStatus().online).toBe(true);

      // 20 s with no telemetry (device sends every 2 s) => considered offline.
      jest.advanceTimersByTime(20_000);
      expect(iotService.getStatus().online).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it("flips deviceOnline to false when the LWT publishes 'offline'", async () => {
    await mqttLib.handleMessage(STATUS_TOPIC, Buffer.from("online"));
    expect(mqttLib.getIotState().deviceOnline).toBe(true);

    await mqttLib.handleMessage(STATUS_TOPIC, Buffer.from("offline"));
    expect(mqttLib.getIotState().deviceOnline).toBe(false);
  });
});

describe("initMqtt + relay command publishing", () => {
  it("connects with credentials from env and subscribes to the device topics", async () => {
    process.env.MQTT_HOST = "broker.example.com";
    process.env.MQTT_PORT = "8883";
    process.env.MQTT_USERNAME = "user";
    process.env.MQTT_PASSWORD = "pass";
    prismaMock.user.findUnique.mockResolvedValue({ id: 7 });

    await mqttLib.initMqtt();

    expect(connectMock).toHaveBeenCalledWith(
      "mqtts://broker.example.com:8883",
      expect.objectContaining({ username: "user", password: "pass" })
    );

    // Fire the registered "connect" handler and check the subscriptions.
    const connectHandler = mqttClientMock.on.mock.calls.find(
      (call) => call[0] === "connect"
    )?.[1] as AnyFn;
    expect(connectHandler).toBeDefined();
    connectHandler();

    expect(mqttClientMock.subscribe).toHaveBeenCalledWith(
      [TELEMETRY_TOPIC, RELAY_STATE_TOPIC, STATUS_TOPIC],
      { qos: 1 },
      expect.any(Function)
    );
  });

  it("publishes { on } to the relay/set topic at QoS 1 via the service", () => {
    iotService.setRelay(false);

    expect(mqttClientMock.publish).toHaveBeenCalledWith(
      "voltwise/esp32-01/relay/set",
      JSON.stringify({ on: false }),
      { qos: 1 }
    );
  });

  it("throws AppError 503 when the broker connection is down", () => {
    mqttClientMock.connected = false;

    expect(() => iotService.setRelay(true)).toThrow(AppError);
    expect(mqttClientMock.publish).not.toHaveBeenCalled();
  });
});

describe("iot controller", () => {
  it("rejects a non-boolean 'on' with 400 before touching the service", async () => {
    const req = { body: { on: "true" } } as unknown as Request;
    const res = createRes();
    const next = jest.fn<AnyFn>() as unknown as NextFunction;

    await iotController.setRelay(req, res as unknown as Response, next);

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ success: false });
    expect(mqttClientMock.publish).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("publishes and returns { success, data } for a valid command", async () => {
    const req = { body: { on: true } } as unknown as Request;
    const res = createRes();
    const next = jest.fn<AnyFn>() as unknown as NextFunction;

    await iotController.setRelay(req, res as unknown as Response, next);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ success: true });
    expect(mqttClientMock.publish).toHaveBeenCalledWith(
      "voltwise/esp32-01/relay/set",
      JSON.stringify({ on: true }),
      { qos: 1 }
    );
  });

  it("returns the status snapshot from GET /api/iot/status", async () => {
    const req = {} as Request;
    const res = createRes();
    const next = jest.fn<AnyFn>() as unknown as NextFunction;

    await iotController.getStatus(req, res as unknown as Response, next);

    expect(res.statusCode).toBe(200);
    const body = res.body as { success: boolean; data: Record<string, unknown> };
    expect(body.success).toBe(true);
    expect(body.data).toEqual(
      expect.objectContaining({
        online: expect.any(Boolean),
        brokerConnected: expect.any(Boolean),
      })
    );
  });
});
