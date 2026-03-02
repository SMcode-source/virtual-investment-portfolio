# TWS API WebSocket Bridge

This bridge connects your browser-based Virtual Investment Portfolio to Interactive Brokers TWS (Trader Workstation) or IB Gateway via the TWS API.

## Architecture

```
Browser App  ←→  WebSocket (ws://localhost:8099)  ←→  Bridge Server  ←→  TWS Socket (port 7497)  ←→  TWS/IB Gateway
```

## Prerequisites

1. **Node.js** v16+ installed
2. **TWS** (Trader Workstation) or **IB Gateway** running
3. API connections enabled in TWS

## TWS Setup

1. Open TWS (or IB Gateway)
2. Go to **Edit → Global Configuration → API → Settings**
3. Check **Enable ActiveX and Socket Clients**
4. Set **Socket port** to:
   - `7497` for paper trading
   - `7496` for live trading
5. Check **Allow connections from localhost only** (recommended)
6. Click **Apply** and **OK**

## Bridge Setup

```bash
cd server
npm install
node bridge.js
```

### Options

| Flag | Default | Description |
|------|---------|-------------|
| `--port` | `8099` | WebSocket server port |
| `--tws-host` | `127.0.0.1` | TWS host address |
| `--tws-port` | `7497` | TWS socket port |
| `--client-id` | `99` | TWS client ID |
| `--verbose` | off | Enable verbose logging |

### Examples

```bash
# Paper trading (default)
node bridge.js

# Live trading
node bridge.js --tws-port 7496

# Verbose logging
node bridge.js --verbose

# Custom ports
node bridge.js --port 9000 --tws-port 7496
```

## Troubleshooting

- **"Bridge Offline"** → The bridge server is not running. Run `node bridge.js`.
- **"TWS Disconnected"** → Bridge is running but can't reach TWS. Check TWS is open with API enabled.
- **No quote data** → Market may be closed, or you may not have a market data subscription for that instrument.
- **Connection refused** → Check that the TWS socket port matches what you configured.
