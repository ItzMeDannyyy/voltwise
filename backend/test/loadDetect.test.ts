// Integration tests for new-load detection inside the MQTT telemetry handler
// (src/lib/mqtt.ts): a sustained watts step must create an INFO alert for the
// ingest user and publish a "new_load" event on the events topic.
//
// Same harness as iot.test.ts: prisma, the generated enums, and the mqtt
// package are mocked with jest.unstable_mockModule BEFORE importing the code
// under test, then handleMessage is driven with fake telemetry buffers.

import { jest, describe, it, expect, beforeEach } from "@jest/globals";

type AnyFn = (...args: any[]) => any;

// ---- Mock the Prisma client ------------------------------------------------
const prismaMock = {
  user: {
    findUnique: jest.fn<AnyFn>(),
  },
  energyReading: {
    create: jest.fn<AnyFn>(),
  },
  alert: {
    create: jest.fn<AnyFn>(),
  },
};

jest.unstable_mockModule("../src/lib/prisma.ts", () => ({
  prisma: prismaMock,
}));

// The alerts service imports the AlertType enum from the generated client.
jest.unstable_mockModule("../src/generated/prisma/index.js", () => ({
  AlertType: { CRITICAL: "CRITICAL", WARNING: "WARNING", INFO: "INFO" },
}));

// ---- Mock the mqtt package ---------------------------------------------------
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

const TELEMETRY_TOPIC = "voltwise/esp32-01/telemetry";
const EVENTS_TOPIC = "voltwise/esp32-01/events";

// Feeds one telemetry sample through the full message handler.
async function sendTelemetry(watts: number) {
  await mqttLib.handleMessage(
    TELEMETRY_TOPIC,
    Buffer.from(JSON.stringify({ watts, kwh: 1.0 }))
  );
}

// Waits for the fire-and-forget notifyNewLoad promise chain to settle.
const flushAsync = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(async () => {
  jest.clearAllMocks();
  mqttClientMock.connected = true;
  prismaMock.energyReading.create.mockResolvedValue({});
  prismaMock.alert.create.mockImplementation((args: { data: unknown }) =>
    Promise.resolve({
      id: 1,
      read: false,
      createdAt: new Date(),
      recommendation: null,
      ...(args.data as Record<string, unknown>),
    })
  );
  prismaMock.user.findUnique.mockResolvedValue({ id: 7 });
  await mqttLib.resolveIngestUser();

  // Give publishEvent a live client (initMqtt stores the mocked one).
  process.env.MQTT_HOST = "broker.example.com";
  process.env.MQTT_USERNAME = "user";
  process.env.MQTT_PASSWORD = "pass";
  await mqttLib.initMqtt();
  jest.clearAllMocks();
});

describe("new-load detection through handleMessage", () => {
  it("creates an INFO alert and publishes a new_load event after a sustained step", async () => {
    // Settle a ~100 W baseline, then a fridge-sized +200 W load switches on.
    await sendTelemetry(100);
    await sendTelemetry(100);
    await sendTelemetry(300);
    await sendTelemetry(300);
    await sendTelemetry(300); // 3rd sustained elevated sample -> detection
    await flushAsync();

    expect(prismaMock.alert.create).toHaveBeenCalledTimes(1);
    const alertArg = prismaMock.alert.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(alertArg.data).toMatchObject({
      userId: 7,
      type: "INFO",
      title: "New load detected",
      value: 200,
      deviceId: null,
      read: false,
    });

    const eventCall = mqttClientMock.publish.mock.calls.find(
      (call) => call[0] === EVENTS_TOPIC
    );
    expect(eventCall).toBeDefined();
    const payload = JSON.parse(eventCall![1] as string);
    expect(payload).toMatchObject({ type: "new_load", deltaWatts: 200 });
  });

  it("does not fire again while the load stays on (adopted baseline)", async () => {
    for (let i = 0; i < 10; i++) await sendTelemetry(300);
    await flushAsync();

    expect(prismaMock.alert.create).not.toHaveBeenCalled();
    expect(
      mqttClientMock.publish.mock.calls.filter((call) => call[0] === EVENTS_TOPIC)
    ).toHaveLength(0);
  });

  it("keeps ingesting telemetry even when the alert insert fails", async () => {
    prismaMock.alert.create.mockRejectedValue(new Error("db down"));

    // New step: 300 -> 600 sustained (cooldown from the first test has state,
    // so use a large jump; the detector is module-level and cooldown default
    // is 2 min of fake-free real time — force detection state with a fresh step
    // far above the adopted 300 W baseline).
    await sendTelemetry(600);
    await sendTelemetry(600);
    await sendTelemetry(600);
    await flushAsync();

    // Ingestion must be untouched by the failed alert.
    expect(prismaMock.energyReading.create).toHaveBeenCalledTimes(3);
  });
});
