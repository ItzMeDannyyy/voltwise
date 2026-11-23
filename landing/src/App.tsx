import { useEffect } from 'react';

const DIAGRAM_SPEC = JSON.stringify({
  layout: 'lanes',
  curve: 'curve',
  alt: 'Readings from the PZEM-004T sensor pass through the ESP32 controller into the 1st Line 10A relay, the 2nd Line 30A relay and the ST7789 240x240 display.',
  input: {
    label: 'PZEM-004T',
    icon: 'ui:gauge',
    meta: '230.4 V',
  },
  core: {
    label: 'ESP32 node',
    icon: 'ui:cpu',
  },
  lanes: [
    {
      label: '1st Line 10A',
      icon: 'ui:plug-zap',
      meta: 'Pin 25',
      done: true,
    },
    {
      label: '2nd Line 30A',
      icon: 'ui:zap',
      meta: 'Pin 26 · +3s',
      done: true,
    },
    {
      label: 'ST7789 TFT',
      icon: 'ui:monitor',
      meta: '240x240 SPI',
      done: true,
    },
  ],
});

function App() {
  useEffect(() => {
    // Load the taste-skill runtime modules once React has mounted the DOM
    const loadScripts = async () => {
      for (const src of [
        '/assets/system.js',
        '/assets/motion/motion.js',
        '/assets/layout/layout.js',
        '/assets/diagrams/mount.js',
      ]) {
        if (!document.querySelector(`script[src="${src}"]`)) {
          const s = document.createElement('script');
          s.type = 'module';
          s.src = src;
          document.body.appendChild(s);
        }
      }
    };
    void loadScripts();
  }, []);

  return (
    <>
      {/* NAV: nav-centre with wordmark */}
      <header className="nav nav--centre">
        <div className="wrap nav__bar">
          <a className="skip-link" href="#top">
            Skip to content
          </a>
          <a className="nav__logo" href="#top">
            VoltWise
          </a>
          <nav className="nav__links" aria-label="Main">
            <div className="nav__item">
              <a className="nav__link" href="#monitor">
                Monitor
              </a>
            </div>
            <div className="nav__item">
              <a className="nav__link" href="#features">
                Relays
              </a>
            </div>
            <div className="nav__item">
              <a className="nav__link" href="#statement">
                Protection
              </a>
            </div>
            <div className="nav__item">
              <a className="nav__link" href="#install">
                Install
              </a>
            </div>
            <div className="nav__item">
              <a className="nav__link" href="#questions">
                Questions
              </a>
            </div>
          </nav>
          <div className="nav__actions">
            <a className="btn btn--primary" href="#install">
              Install for Android
            </a>
          </div>
          <button
            className="nav__toggle"
            type="button"
            aria-expanded="false"
            aria-label="Menu"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path
                d="M2 5h14M2 13h14"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </header>

      <main id="top">
        {/* SECTION 1: HERO (hero--collage) */}
        <section
          className="hero hero--collage"
          data-enter=""
          aria-labelledby="hero-h"
        >
          <div className="wrap">
            <div className="hero-text grid hero__grid">
              <div className="hero__text span-5">
                <h1 id="hero-h">
                  Home energy monitor and relay control for Android
                </h1>
                <p className="hero__lead">
                  VoltWise reads your PZEM-004T sensor every 2 seconds over
                  MQTT, trips at 3,000 W, and staggers your 10A and 30A relay
                  lines by 3 seconds on restore.
                </p>
                <div className="btn-row">
                  <a className="btn btn--primary" href="#install">
                    Install for Android
                  </a>
                  <a className="btn btn--secondary" href="#monitor">
                    See live telemetry
                  </a>
                </div>
                <p className="hero__proof">
                  ESP32 firmware with ST7789 240x240 IPS TFT display and HiveMQ
                  TLS broker.
                </p>
              </div>

              <div
                className="hero__art span-6 start-7"
                data-fx="gradient-mesh"
                data-fx-seed="42"
                role="img"
                aria-label="VoltWise live circuit telemetry showing 1st Line 10A and 2nd Line 30A relays with a 3-second staggered startup sequence"
              >
                <div
                  className="ly-piece ly-piece--main d-win"
                  aria-hidden="true"
                >
                  <div className="d-win__bar">
                    <span className="d-win__dots">
                      <i></i>
                      <i></i>
                      <i></i>
                    </span>
                    <span>VoltWise · esp32-01 · 230.4 V · 60.0 Hz</span>
                  </div>
                  <div className="d-win__body">
                    <div className="d-side">
                      <span className="is-on">
                        <i></i>Dashboard
                      </span>
                      <span>
                        <i></i>Devices
                      </span>
                      <span>
                        <i></i>Alerts
                      </span>
                      <span>
                        <i></i>Analytics
                      </span>
                      <span className="d-side__label">Relay lines</span>
                      <span>
                        <i></i>1st Line 10A
                      </span>
                      <span>
                        <i></i>2nd Line 30A
                      </span>
                    </div>
                    <div className="d-main">
                      <div className="d-main__head">
                        <h4>Live circuits</h4>
                        <span className="d-btn">Master ON</span>
                      </div>
                      <div className="d-tabs">
                        <span className="is-on">All 6</span>
                        <span>2nd Line 2</span>
                        <span>1st Line 4</span>
                      </div>
                      <div className="d-rows">
                        <div className="d-row">
                          <span className="d-thumb">AC</span>
                          <div>
                            <b>Split Aircon</b>
                            <small>2nd Line · GPIO 26 · 30A</small>
                          </div>
                          <span className="num">1,180 W</span>
                          <span className="d-chip">Active</span>
                        </div>
                        <div className="d-row">
                          <span className="d-thumb">RF</span>
                          <div>
                            <b>Kitchen Refrigerator</b>
                            <small>2nd Line · GPIO 26 · 30A</small>
                          </div>
                          <span className="num">145 W</span>
                          <span className="d-chip">Active</span>
                        </div>
                        <div className="d-row">
                          <span className="d-thumb">RC</span>
                          <div>
                            <b>Induction Rice Cooker</b>
                            <small>1st Line · GPIO 25 · 10A</small>
                          </div>
                          <span className="num">680 W</span>
                          <span className="d-chip d-chip--low">Warming</span>
                        </div>
                        <div className="d-row">
                          <span className="d-thumb">WS</span>
                          <div>
                            <b>Desk Workstation</b>
                            <small>1st Line · GPIO 25 · 10A</small>
                          </div>
                          <span className="num">210 W</span>
                          <span className="d-chip">Active</span>
                        </div>
                        <div className="d-row">
                          <span className="d-thumb">TV</span>
                          <div>
                            <b>Living Room OLED TV</b>
                            <small>1st Line · GPIO 25 · 10A</small>
                          </div>
                          <span className="num">95 W</span>
                          <span className="d-chip">Active</span>
                        </div>
                        <div className="d-row">
                          <span className="d-thumb">LT</span>
                          <div>
                            <b>Hallway LED Circuit</b>
                            <small>1st Line · GPIO 25 · 10A</small>
                          </div>
                          <span className="num">34 W</span>
                          <span className="d-chip">Active</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  className="ly-piece ly-piece--note d-card"
                  aria-hidden="true"
                  data-ly-steps="700"
                >
                  <div className="d-card__row">
                    <h5>Staggered restore</h5>
                    <span className="d-chip" data-step="" data-step-at="4">
                      Restored
                    </span>
                  </div>
                  <div className="d-note__line" data-step="">
                    <i className="warn">!</i>
                    <span>
                      <b>1st Line (Pin 25)</b> energized first
                    </span>
                  </div>
                  <div className="d-note__line" data-step="">
                    <i>✓</i>
                    <span>
                      <b>3.0 s</b> inrush delay elapsed
                    </span>
                  </div>
                  <div className="d-note__line" data-step="">
                    <i>✓</i>
                    <span>
                      <b>2nd Line (Pin 26)</b> online at 1,325 W
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 2: APP-FRAME (#monitor) */}
        <section
          className="section"
          id="monitor"
          aria-labelledby="monitor-h"
        >
          <div className="wrap">
            <div className="grid">
              <div className="span-5">
                <h2 id="monitor-h">
                  Every circuit and kilowatt-hour in one window.
                </h2>
              </div>
              <div className="span-6 start-7">
                <p className="t-lead muted">
                  Inspect live voltage, current, power factor, and per-line
                  appliance draw alongside your daily kilowatt-hour consumption
                  and tariff forecast.
                </p>
              </div>
            </div>

            <div
              className="ui app fill"
              role="img"
              aria-label="VoltWise circuit monitor showing appliance telemetry rows on the left and a 14-day kilowatt-hour usage bar chart on the right"
              data-ui-pause-host=""
            >
              <div className="app__pane app__pane--list">
                <div
                  className="ui ui-panel ui-win"
                  data-ui="window"
                  data-open="Active"
                  data-work="Sampling"
                  data-done="Idle"
                >
                  <div className="ui-win__bar">
                    <span className="ui-dots" aria-hidden="true">
                      <i></i>
                      <i></i>
                      <i></i>
                    </span>
                    <span className="ui-win__crumb">
                      VoltWise <i>/</i> <b>esp32-01</b>
                    </span>
                    <span className="ui-spacer"></span>
                    <span className="ui-win__search" aria-hidden="true">
                      <svg className="ui-icon" viewBox="0 0 16 16">
                        <circle cx="7" cy="7" r="4.5" />
                        <path d="m10.5 10.5 3 3" />
                      </svg>
                      <span className="ui-win__ph">Filter</span>
                      <span className="ui-kbd">/</span>
                    </span>
                  </div>
                  <div className="ui-win__body">
                    <nav className="ui-win__side" aria-hidden="true">
                      <span className="ui-win__nav is-on">
                        Circuits<em>9</em>
                      </span>
                      <span className="ui-win__nav">
                        1st Line<em>6</em>
                      </span>
                      <span className="ui-win__nav">
                        2nd Line<em>3</em>
                      </span>
                      <span className="ui-win__nav">Events</span>
                      <span className="ui-win__label">Metrics</span>
                      <span className="ui-win__nav">
                        <span className="ui-win__hash">#</span>230.4 V
                      </span>
                      <span className="ui-win__nav">
                        <span className="ui-win__hash">#</span>0.96 PF
                      </span>
                    </nav>
                    <div className="ui-win__main">
                      <div className="ui-win__cols" aria-hidden="true">
                        <span>Appliance</span>
                        <span>Line &amp; Draw</span>
                        <span>State</span>
                        <span>Poll</span>
                      </div>
                      <ul className="ui-win__rows">
                        <li className="ui-win__row" data-row="">
                          <span className="ui-avatar" data-tone="4">
                            AC
                          </span>
                          <span className="ui-win__who">Split Aircon</span>
                          <span className="ui-win__sub">
                            2nd Line · 1,180 W · 5.13 A
                          </span>
                          <span className="ui-win__st" data-st="">
                            Active
                          </span>
                          <span className="ui-win__age">2s</span>
                        </li>
                        <li className="ui-win__row" data-row="">
                          <span className="ui-avatar" data-tone="3">
                            RF
                          </span>
                          <span className="ui-win__who">Kitchen Fridge</span>
                          <span className="ui-win__sub">
                            2nd Line · 145 W · 0.63 A
                          </span>
                          <span className="ui-win__st" data-st="">
                            Active
                          </span>
                          <span className="ui-win__age">2s</span>
                        </li>
                        <li className="ui-win__row" data-row="">
                          <span className="ui-avatar" data-tone="1">
                            RC
                          </span>
                          <span className="ui-win__who">Rice Cooker</span>
                          <span className="ui-win__sub">
                            1st Line · 680 W · 2.95 A
                          </span>
                          <span className="ui-win__st" data-st="">
                            Active
                          </span>
                          <span className="ui-win__age">2s</span>
                        </li>
                        <li className="ui-win__row" data-row="">
                          <span className="ui-avatar" data-tone="2">
                            WS
                          </span>
                          <span className="ui-win__who">Workstation</span>
                          <span className="ui-win__sub">
                            1st Line · 210 W · 0.91 A
                          </span>
                          <span className="ui-win__st is-you" data-st="">
                            Peak
                          </span>
                          <span className="ui-win__age">4s</span>
                        </li>
                        <li className="ui-win__row" data-row="">
                          <span className="ui-avatar" data-tone="5">
                            TV
                          </span>
                          <span className="ui-win__who">Living Room TV</span>
                          <span className="ui-win__sub">
                            1st Line · 95 W · 0.41 A
                          </span>
                          <span className="ui-win__st" data-st="">
                            Active
                          </span>
                          <span className="ui-win__age">4s</span>
                        </li>
                        <li className="ui-win__row" data-row="">
                          <span className="ui-avatar" data-tone="3">
                            WH
                          </span>
                          <span className="ui-win__who">Water Heater</span>
                          <span className="ui-win__sub">
                            2nd Line · 0 W · 0.00 A
                          </span>
                          <span className="ui-win__st is-done" data-st="">
                            Idle
                          </span>
                          <span className="ui-win__age">6s</span>
                        </li>
                        <li className="ui-win__row" data-row="">
                          <span className="ui-avatar" data-tone="4">
                            FN
                          </span>
                          <span className="ui-win__who">Bedroom Fan</span>
                          <span className="ui-win__sub">
                            1st Line · 48 W · 0.21 A
                          </span>
                          <span className="ui-win__st" data-st="">
                            Active
                          </span>
                          <span className="ui-win__age">6s</span>
                        </li>
                        <li className="ui-win__row" data-row="">
                          <span className="ui-avatar" data-tone="2">
                            RT
                          </span>
                          <span className="ui-win__who">Fiber Router</span>
                          <span className="ui-win__sub">
                            1st Line · 18 W · 0.08 A
                          </span>
                          <span className="ui-win__st" data-st="">
                            Active
                          </span>
                          <span className="ui-win__age">8s</span>
                        </li>
                        <li className="ui-win__row" data-row="">
                          <span className="ui-avatar" data-tone="1">
                            LT
                          </span>
                          <span className="ui-win__who">Hallway Lights</span>
                          <span className="ui-win__sub">
                            1st Line · 34 W · 0.15 A
                          </span>
                          <span className="ui-win__st is-done" data-st="">
                            Idle
                          </span>
                          <span className="ui-win__age">8s</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              <div className="app__pane app__pane--open" data-ui-loop="">
                <div
                  className="ui ui-panel ui-stat is-fill"
                  data-ui="stat"
                  data-from="142"
                  data-to="118"
                  data-suffix=" kWh"
                  data-ui-opts='{"fill":true}'
                >
                  <div className="ui-stat__head">
                    <div className="ui-stat__top">
                      <span className="ui-stat__label">
                        14-day billing cycle consumption
                      </span>
                      <span className="ui-stat__range">
                        Billing cycle
                        <svg
                          className="ui-icon"
                          viewBox="0 0 16 16"
                          aria-hidden="true"
                        >
                          <path d="m4.5 6.5 3.5 3.5 3.5-3.5" />
                        </svg>
                      </span>
                    </div>
                    <div className="ui-stat__line">
                      <span className="ui-stat__num" data-stat-num="">
                        118 kWh
                      </span>
                      <span className="ui-chip ui-chip--plain ui-stat__delta">
                        2,410 W live
                      </span>
                      <span className="ui-stat__sub">
                        3,000 W safety cutoff armed · PF 0.96
                      </span>
                    </div>
                  </div>
                  <div className="ui-stat__chart">
                    <svg
                      className="ui-stat__svg"
                      viewBox="0 0 400 120"
                      preserveAspectRatio="none"
                      aria-hidden="true"
                    >
                      <path
                        className="ui-stat__grid"
                        d="M0 30.5H400M0 60.5H400M0 90.5H400"
                      />
                      <path
                        className="ui-stat__cover"
                        fillRule="evenodd"
                        d=""
                      />
                      <g className="ui-stat__bars">
                        <rect
                          rx="3"
                          x="0.00"
                          y="49.04"
                          width="21.14"
                          height="70.96"
                        />
                        <rect
                          rx="3"
                          x="29.14"
                          y="40.86"
                          width="21.14"
                          height="79.14"
                        />
                        <rect
                          rx="3"
                          x="58.29"
                          y="44.95"
                          width="21.14"
                          height="75.05"
                        />
                        <rect
                          rx="3"
                          x="87.43"
                          y="36.76"
                          width="21.14"
                          height="83.24"
                        />
                        <rect
                          rx="3"
                          x="116.57"
                          y="42.22"
                          width="21.14"
                          height="77.78"
                        />
                        <rect
                          rx="3"
                          x="145.71"
                          y="34.04"
                          width="21.14"
                          height="85.96"
                        />
                        <rect
                          rx="3"
                          x="174.86"
                          y="38.13"
                          width="21.14"
                          height="81.87"
                        />
                        <rect
                          rx="3"
                          x="204.00"
                          y="29.94"
                          width="21.14"
                          height="90.06"
                        />
                        <rect
                          rx="3"
                          x="233.14"
                          y="35.40"
                          width="21.14"
                          height="84.60"
                        />
                        <rect
                          rx="3"
                          x="262.29"
                          y="25.85"
                          width="21.14"
                          height="94.15"
                        />
                        <rect
                          rx="3"
                          x="291.43"
                          y="31.31"
                          width="21.14"
                          height="88.69"
                        />
                        <rect
                          rx="3"
                          x="320.57"
                          y="23.12"
                          width="21.14"
                          height="96.88"
                        />
                        <rect
                          rx="3"
                          x="349.71"
                          y="27.21"
                          width="21.14"
                          height="92.79"
                        />
                        <rect
                          rx="3"
                          x="378.86"
                          y="16.30"
                          width="21.14"
                          height="103.70"
                        />
                      </g>
                    </svg>
                    <div className="ui-stat__axis" aria-hidden="true">
                      <span>Day 1</span>
                      <span>Day 7</span>
                      <span>Today</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 3: FEATURES-2x2 (#features, 2 screens .g2) */}
        <section
          className="section g2"
          id="features"
          aria-labelledby="features-h"
        >
          <div className="wrap">
            <div className="group">
              <div className="section-head">
                <h2 id="features-h">
                  Two relay lines, one ESP32 controller.{' '}
                  <span className="muted">
                    Hardware protection and live MQTT rules from your phone.
                  </span>
                </h2>
              </div>
              <div className="grid">
                <article className="card card--row card--open span-6">
                  <h3>Splits 10A and 30A relay lines</h3>
                  <p>
                    Switch your 1st Line outlets on GPIO 25 and 2nd Line heavy
                    appliances on GPIO 26 with a 3-second stagger.
                  </p>
                  <div
                    className="panel"
                    data-fx="painterly-landscape"
                    data-fx-seed="11"
                    data-fx-palette='{"bg":"#a3b0b6","accent":"#c49a6c"}'
                    data-fx-params='{"blur":1,"brush":0.35,"slope":0,"hillY":0.3,"horizon":0.62,"drift":0}'
                    style={{ '--calm-k': '0%' } as React.CSSProperties}
                  >
                    <div className="stage stage--fade-b">
                      <div
                        className="at-right to-edge"
                        style={
                          {
                            '--ax': '32px',
                            '--ay': '48px',
                          } as React.CSSProperties
                        }
                        data-ui-loop=""
                      >
                        <div
                          className="ui ui-panel ui-toggles"
                          data-ui="toggles"
                        >
                          <div className="ui-head">
                            <div className="ui-title">Relay policy</div>
                            <span className="ui-spacer"></span>
                            <div className="ui-meta" data-tg-count="">
                              3 of 4 on
                            </div>
                          </div>
                          <ul className="ui-toggles__list">
                            <li className="ui-tg">
                              <span className="ui-tg__text">
                                <span className="ui-tg__label">
                                  1st Line · GPIO 25 (10A)
                                </span>
                                <span className="ui-tg__sub">
                                  Outlets, TV, rice cooker, lights
                                </span>
                              </span>
                              <button
                                className="ui-switch is-on"
                                type="button"
                                role="switch"
                                aria-checked="true"
                                aria-label="1st Line GPIO 25 10A relay"
                              >
                                <i></i>
                              </button>
                            </li>
                            <li className="ui-tg">
                              <span className="ui-tg__text">
                                <span className="ui-tg__label">
                                  2nd Line · GPIO 26 (30A)
                                </span>
                                <span className="ui-tg__sub">
                                  Aircon and refrigerator (+3s delay)
                                </span>
                              </span>
                              <button
                                className="ui-switch is-on"
                                type="button"
                                role="switch"
                                aria-checked="true"
                                aria-label="2nd Line GPIO 26 30A relay"
                              >
                                <i></i>
                              </button>
                            </li>
                            <li className="ui-tg">
                              <span className="ui-tg__text">
                                <span className="ui-tg__label">
                                  3,000 W overload cutoff
                                </span>
                                <span className="ui-tg__sub">
                                  Trips both lines on watt surge
                                </span>
                              </span>
                              <button
                                className="ui-switch is-on"
                                type="button"
                                role="switch"
                                aria-checked="true"
                                aria-label="3000 watt overload cutoff"
                              >
                                <i></i>
                              </button>
                            </li>
                            <li className="ui-tg">
                              <span className="ui-tg__text">
                                <span className="ui-tg__label">
                                  30-minute idle countdown
                                </span>
                                <span className="ui-tg__sub">
                                  Optional timer above 0.05 A
                                </span>
                              </span>
                              <button
                                className="ui-switch"
                                type="button"
                                role="switch"
                                aria-checked="false"
                                aria-label="30 minute idle countdown"
                              >
                                <i></i>
                              </button>
                            </li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>

                <article className="card card--row card--open span-6">
                  <h3>Flags overload trips as they happen</h3>
                  <p>
                    Receive MQTT event logs whenever active power crosses your
                    threshold or the ESP32 restores power.
                  </p>
                  <div className="panel">
                    <div className="stage stage--fade-b">
                      <div
                        className="at-rise fit"
                        style={
                          {
                            '--ax': '32px',
                            '--ay': 'calc(100% - 190px)',
                            '--ay-sm': 'calc(100% - 170px)',
                            '--fit-max': '380px',
                          } as React.CSSProperties
                        }
                      >
                        <div className="ui ui-notify" data-ui="notify">
                          <ul
                            className="ui-notify__list"
                            data-notify-list=""
                          >
                            <li className="ui-note">
                              <span
                                className="ui-agent ui-note__av"
                                aria-hidden="true"
                              ></span>
                              <span className="ui-note__text">
                                <span className="ui-note__title">
                                  Safety cutoff tripped<time>now</time>
                                </span>
                                <span className="ui-note__body">
                                  Load reached 3,180 W (limit 3,000 W)
                                </span>
                              </span>
                              <span className="ui-btn ui-btn--sm ui-note__btn">
                                Reset
                              </span>
                            </li>
                            <li className="ui-note">
                              <span
                                className="ui-avatar ui-note__av"
                                data-tone="4"
                              >
                                L2
                              </span>
                              <span className="ui-note__text">
                                <span className="ui-note__title">
                                  2nd Line restored<time>3s</time>
                                </span>
                                <span className="ui-note__body">
                                  Pin 26 closed after 3s stagger
                                </span>
                              </span>
                            </li>
                            <li className="ui-note">
                              <span
                                className="ui-avatar ui-note__av"
                                data-tone="3"
                              >
                                L1
                              </span>
                              <span className="ui-note__text">
                                <span className="ui-note__title">
                                  1st Line energized<time>6s</time>
                                </span>
                                <span className="ui-note__body">
                                  Pin 25 closed · 230.2 V stable
                                </span>
                              </span>
                            </li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              </div>
            </div>

            <div className="grid">
              <article className="card card--row card--open span-6">
                <h3>Routes PZEM telemetry to relay lanes</h3>
                <p>
                  UART readings on GPIO 16 and 17 feed the ESP32 safety logic,
                  both relay pins, and the 240x240 ST7789 SPI display.
                </p>
                <div className="panel">
                  <div
                    className="dg"
                    data-dg-still=""
                    data-diagram={DIAGRAM_SPEC}
                  ></div>
                </div>
              </article>

              <article className="card card--row card--open span-6">
                <h3>Forecasts your billing cycle</h3>
                <p>
                  Multiplies accumulated kilowatt-hours by your local utility
                  tariff so you see your bill before it closes.
                </p>
                <div className="panel">
                  <div className="stage stage--fade-b">
                    <div
                      className="at-corner to-edge fit"
                      style={
                        {
                          '--ax': '28px',
                          '--ay': '36px',
                          '--fit-max': '420px',
                        } as React.CSSProperties
                      }
                    >
                      <div
                        className="ui ui-panel ui-stat is-fill"
                        data-ui="stat"
                        data-from="124"
                        data-to="118"
                        data-suffix=" kWh"
                        data-ui-opts='{"fill":true}'
                      >
                        <div className="ui-stat__head">
                          <div className="ui-stat__top">
                            <span className="ui-stat__label">
                              Cycle energy total
                            </span>
                            <span className="ui-stat__range">This month</span>
                          </div>
                          <div className="ui-stat__line">
                            <span className="ui-stat__num" data-stat-num="">
                              118 kWh
                            </span>
                            <span className="ui-chip ui-chip--plain ui-stat__delta">
                              -18%
                            </span>
                            <span className="ui-stat__sub">
                              vs. previous 30-day cycle
                            </span>
                          </div>
                        </div>
                        <div className="ui-stat__chart">
                          <svg
                            className="ui-stat__svg"
                            viewBox="0 0 400 120"
                            preserveAspectRatio="none"
                            aria-hidden="true"
                          >
                            <path
                              className="ui-stat__grid"
                              d="M0 30.5H400M0 60.5H400M0 90.5H400"
                            />
                            <path
                              className="ui-stat__cover"
                              fillRule="evenodd"
                              d=""
                            />
                            <g className="ui-stat__bars">
                              <rect
                                rx="3"
                                x="0.00"
                                y="49.04"
                                width="21.14"
                                height="70.96"
                              />
                              <rect
                                rx="3"
                                x="29.14"
                                y="40.86"
                                width="21.14"
                                height="79.14"
                              />
                              <rect
                                rx="3"
                                x="58.29"
                                y="44.95"
                                width="21.14"
                                height="75.05"
                              />
                              <rect
                                rx="3"
                                x="87.43"
                                y="36.76"
                                width="21.14"
                                height="83.24"
                              />
                              <rect
                                rx="3"
                                x="116.57"
                                y="42.22"
                                width="21.14"
                                height="77.78"
                              />
                              <rect
                                rx="3"
                                x="145.71"
                                y="34.04"
                                width="21.14"
                                height="85.96"
                              />
                              <rect
                                rx="3"
                                x="174.86"
                                y="38.13"
                                width="21.14"
                                height="81.87"
                              />
                              <rect
                                rx="3"
                                x="204.00"
                                y="29.94"
                                width="21.14"
                                height="90.06"
                              />
                              <rect
                                rx="3"
                                x="233.14"
                                y="35.40"
                                width="21.14"
                                height="84.60"
                              />
                              <rect
                                rx="3"
                                x="262.29"
                                y="25.85"
                                width="21.14"
                                height="94.15"
                              />
                              <rect
                                rx="3"
                                x="291.43"
                                y="31.31"
                                width="21.14"
                                height="88.69"
                              />
                              <rect
                                rx="3"
                                x="320.57"
                                y="23.12"
                                width="21.14"
                                height="96.88"
                              />
                              <rect
                                rx="3"
                                x="349.71"
                                y="27.21"
                                width="21.14"
                                height="92.79"
                              />
                              <rect
                                rx="3"
                                x="378.86"
                                y="16.30"
                                width="21.14"
                                height="103.70"
                              />
                            </g>
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* SECTION 4: STATEMENT MOMENT (#statement, liquid-type + bg-mist) */}
        <section
          className="section bg-mist"
          id="statement"
          aria-labelledby="statement-h"
        >
          <div className="wrap">
            <div data-moment="liquid-type" className="section-head">
              <h2 id="statement-h" className="mo-lt__type">
                Cuts power in two seconds
              </h2>
              <p className="t-lead">
                When your household draw crosses 3,000 W, the ESP32 opens both
                relays on the spot and waits 15 seconds on boot before
                energizing your lines in sequence.
              </p>
            </div>
            <dl className="stats" style={{ marginTop: 'auto' }}>
              <div>
                <dt className="t-small muted">Telemetry polling interval</dt>
                <dd className="t-stat">2.0 s</dd>
              </div>
              <div>
                <dt className="t-small muted">
                  1st to 2nd Line restore stagger
                </dt>
                <dd className="t-stat">3.0 s</dd>
              </div>
              <div>
                <dt className="t-small muted">
                  Default hardware overload cutoff
                </dt>
                <dd className="t-stat">3,000 W</dd>
              </div>
              <div>
                <dt className="t-small muted">On-board SPI IPS display</dt>
                <dd className="t-stat">240 px</dd>
              </div>
            </dl>
          </div>
        </section>

        {/* SECTION 5: INSTALL WITH QR CODE (#install, split-text-left) */}
        <section
          className="section"
          id="install"
          aria-labelledby="install-h"
        >
          <div className="wrap">
            <div className="grid fill">
              <div className="split-col span-5">
                <h2 id="install-h">
                  Scan the QR code to install VoltWise on Android.
                </h2>
                <p className="t-lead">
                  Point your phone camera at the QR code to download the signed
                  VoltWise Android APK and pair your ESP32 board over Wi-Fi.
                </p>
                <ul className="rows">
                  <li>
                    <span className="rows__name">1. Scan with your phone</span>
                    <span className="rows__value">Android 10+</span>
                  </li>
                  <li>
                    <span className="rows__name">
                      2. Join VoltWise-Setup AP
                    </span>
                    <span className="rows__value">192.168.4.1</span>
                  </li>
                  <li>
                    <span className="rows__name">
                      3. Enter your ESP32 DEVICE_UID
                    </span>
                    <span className="rows__value">MQTT over TLS</span>
                  </li>
                </ul>
                <div className="split-col__end">
                  <a className="link" href="qr-code.png" download="voltwise-qr.png">
                    Save the QR code image
                  </a>
                </div>
              </div>

              <div className="frame frame--split frame--fill span-6 start-7">
                <div className="qr-card">
                  <div className="qr-card__head">
                    <span className="qr-card__title">VoltWise Android APK</span>
                    <span className="qr-card__tag">v2.4 · SDK 54</span>
                  </div>
                  <div className="qr-card__box">
                    <img
                      className="qr-card__img"
                      src="qr-code.png"
                      alt="QR code to download and install the VoltWise Android application"
                      width="220"
                      height="220"
                    />
                  </div>
                  <div className="qr-card__meta">
                    <span>Scan with Android camera</span>
                    <span>Direct APK install</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 6: FAQ (#questions, bg-band) */}
        <section
          className="section bg-band"
          id="questions"
          aria-labelledby="questions-h"
        >
          <div className="wrap">
            <div className="grid">
              <div className="span-5">
                <div className="section-head">
                  <h2 id="questions-h">Questions</h2>
                  <p className="t-lead">
                    Hardware wiring, Android installation, and MQTT pairing.
                  </p>
                </div>
              </div>
              <div className="faq span-6 start-7">
                <div className="faq__item">
                  <h3>How do I install the Android app from the QR code?</h3>
                  <p>
                    Open your Android camera, scan the QR code in the Install
                    section, and open the download link to install the signed
                    VoltWise APK.
                  </p>
                </div>
                <div className="faq__item">
                  <h3>Why are the two relay lines staggered by 3 seconds?</h3>
                  <p>
                    Energizing the 10A low-load line on GPIO 25 before the 30A
                    heavy-load line on GPIO 26 prevents inrush current spikes
                    and ESP32 brownout resets.
                  </p>
                </div>
                <div className="faq__item">
                  <h3>What happens if my home Wi-Fi drops at boot?</h3>
                  <p>
                    If Wi-Fi does not connect within 15 seconds, the ESP32
                    enters autonomous mode and energizes both relay lines with
                    the 3,000 W safety cutoff active.
                  </p>
                </div>
                <div className="faq__item">
                  <h3>Can I pair the app with another ESP32 board?</h3>
                  <p>
                    Yes. Open the Sensor and IoT screen in the app and enter the
                    new board&apos;s DEVICE_UID or scan retained status topics on
                    the MQTT broker.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER.CLOSING: close-word + footer-dark */}
      <footer
        className="footer closing footer--dark ground-inverse"
        id="contact"
        aria-labelledby="close-h"
      >
        <div className="wrap">
          <div className="closing__cta close--word">
            <div className="section-head--split">
              <div>
                <h2 id="close-h">Install VoltWise on your Android phone</h2>
                <p className="t-lead">
                  Scan the QR code above and pair your ESP32 sensor in under two
                  minutes.
                </p>
              </div>
              <a className="btn btn--primary" href="#install">
                Install for Android
              </a>
            </div>
            <p className="close__word" aria-hidden="true">
              VoltWise
            </p>
          </div>

          <div className="closing__links">
            <div className="grid">
              <div className="span-4">
                <a className="nav__logo" href="#top">
                  VoltWise
                </a>
                <p className="footer__lede">
                  Live PZEM-004T telemetry and dual-line relay control by
                  VoltMinds.
                </p>
              </div>
              <div className="span-2 footer__col">
                <h3>Monitor</h3>
                <ul>
                  <li>
                    <a href="#monitor">Live window</a>
                  </li>
                  <li>
                    <a href="#monitor">Billing cycle</a>
                  </li>
                </ul>
              </div>
              <div className="span-2 footer__col">
                <h3>Relays</h3>
                <ul>
                  <li>
                    <a href="#features">10A &amp; 30A lines</a>
                  </li>
                  <li>
                    <a href="#features">Overload alerts</a>
                  </li>
                </ul>
              </div>
              <div className="span-2 footer__col">
                <h3>Protection</h3>
                <ul>
                  <li>
                    <a href="#statement">3,000 W cutoff</a>
                  </li>
                  <li>
                    <a href="#questions">Autonomous mode</a>
                  </li>
                </ul>
              </div>
              <div className="span-2 footer__col">
                <h3>Install</h3>
                <ul>
                  <li>
                    <a href="#install">Android QR code</a>
                  </li>
                  <li>
                    <a href="#questions">Questions</a>
                  </li>
                </ul>
              </div>
            </div>

            <div className="footer__legal">
              <span>
                &copy; 2026 VoltWise by VoltMinds &nbsp;{' '}
                <a href="privacy.html">Privacy</a> &nbsp;{' '}
                <a href="terms.html">Terms</a>
              </span>
              <div className="socials"></div>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}

export default App;
