# VanMoof Webtoolkit

A small web page that talks to the battery from a VanMoof **S3 / S4** bike and
shows you how it's doing - cell by cell - right in your browser. No app to
install, nothing gets uploaded anywhere.

Think of it as a health check for your bike's battery: voltages, temperatures,
charge level, and whether the battery has switched itself off to protect itself.

## What it can do

- **See the battery's health** at a glance: overall charge, each cell drawn as a
  little battery (green = good, yellow = getting low, red = low), temperatures,
  and any error the battery is reporting.
- **Spot a bad cell** - a weak or unbalanced cell is highlighted, so you can tell
  whether a tired battery has one bad group or is just worn out.
- **Advanced repairs** (for people who know what they're doing): clear a
  "Power Failure" lock, reset settings, or update the battery's firmware.

## What you need

1. A **computer** running **Chrome or Microsoft Edge** (this uses a browser
   feature for talking to USB devices that phones and Safari don't have).
2. A **USB-to-serial (UART) adapter** - a small, inexpensive cable that lets the
   computer talk to the battery.
3. The **battery**, wired to the adapter. Getting the battery out of the frame
   and wired up is the fiddly part; the wiring details live in the companion
   project's documentation.

> Working inside a bike battery has real risks (fire, shock, damage). If you're
> not comfortable with that, this part is best left to someone who is.

## Getting started

1. Open the webtoolkit (your hosted link, or run it locally - see below).
2. With the battery plugged in, click **Connect (hardware)** and pick your
   adapter from the list your browser shows.
3. The dashboard fills in and refreshes about once a second.

## Reading the dashboard

- **Cells** - ten little batteries (the S3 pack is 10 groups of cells). Their
  colour shows charge; the weakest group is outlined so it's easy to find. A
  small "spread" number tells you how unbalanced the pack is - a big spread on an
  otherwise-charged pack points to a failing group.
- **Status** - a green **OK** means the battery is happy. If it has shut itself
  off, you'll see the reason spelled out (for example "Under-Voltage Protection").
- **Temperatures, charge, capacity, serial number** - shown in plain numbers, and
  the manufacture date is formatted the way your computer normally shows dates.

## Expert mode

Tick **Expert mode** to unlock advanced tools: a raw terminal, one-click battery
commands, and firmware updating. Every action asks you to confirm first.

> ⚠️ These can change or, in the worst case, permanently break the battery - for
> example, flashing the wrong firmware can brick it. Only use them if you
> understand what each one does.

## Is my data safe?

Yes. Everything runs entirely in your browser and talks only to the battery over
the cable. Nothing about your battery is sent to any server.

## For developers

It's a plain TypeScript app built with [Vite](https://vitejs.dev/) - no backend,
no runtime dependencies.

```bash
npm install
npm run dev     # local dev server (browser talks to the battery over localhost)
npm test        # run the tests
npm run build   # produce the static site in dist/
```

The built site is just static files, so it can be hosted anywhere - including
GitHub Pages.

Add **`?sim`** to the URL (e.g. `…/index.html?sim`) to reveal a simulated
battery and a set of fault scenarios (shutdown, faulty/imbalanced cell,
over-temperature, firmware CRC error, …). This is for development and previews -
it's hidden from the normal interface.

## Compatibility

- **Batteries:** VanMoof S3 / S4 (DynaPack BMS, over UART/Modbus).
- **Browsers:** desktop Chrome / Edge (and other Chromium-based browsers).

The A5 / S5 battery uses a different connection (CAN bus) and isn't supported yet.
