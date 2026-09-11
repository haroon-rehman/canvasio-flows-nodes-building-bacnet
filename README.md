# BACnet IP Client

Canvas IO Workflows — maintained integration/fork of an independent Node-RED node package.

## Canvas IO

| | |
|--|--|
| Domain | Building / BACnet |
| Development status | Integrated in local harness (cio-wfs-dev) |
| Palette category (operational) | `Canvas IO` |
| Config nodes | remain `category: "config"` |
| Local repository | `cio-wfs-nodes/cio-wfs-node-building-bacnet` |
| npm package name | `@halsystems/red-bacnet` (unchanged) |

`cio-wfs-nodes` is an organizational parent only — not a monorepo. One node package = one Git repository.

This repository is a **Canvas IO-maintained integration/fork**. Protocol and node runtime logic originate from upstream; Canvas IO changes are limited to integration, presentation, and local development packaging.

## Nodes

### Operational (palette: Canvas IO)

- `discover device`, `discover point`, `read point`, `write point`

### Configuration

- `bacnet client`

## Development

```powershell
cd C:\GitHub\canvasio\cio-wfs-nodes\cio-wfs-node-building-bacnet
npm install
```

Local harness:

```powershell
cd C:\GitHub\canvasio\cio-wfs-dev
npm install
cd C:\GitHub\canvasio\cio-wfs-core
node packages/node_modules/node-red/red.js --userDir C:\GitHub\canvasio\cio-wfs-dev
```

Open http://localhost:1880

## Testing

```powershell
npm test
```

## Upstream

| | |
|--|--|
| Original package | `@halsystems/red-bacnet` |
| Upstream project | https://github.com/Hal-Systems-AU/red-bacnet-public |

Canvas IO does not claim authorship of the original upstream implementation.

## License

MIT — see ``LICENSE`` and upstream attribution.

---

## Upstream documentation

The following sections retain useful upstream technical documentation (adapted only where needed).

# About
RED-BACnet is a BACnet IP driver designed for Node-RED, enabling interaction with BACnet devices.

Features include:
- discovering devices
- discovering points
- bulk reading points
- bulk writing points

## Installation
### Install using Node-RED Palette Manager
```md
1. Click the 'Hamburger' icon at the top right corner.
2. Select the 'Manage palette' option.
3. Click the 'Install' tab and type '@halsystems/red-bacnet' into the search field.
4. Click to install.
```

### Install using NPM
```bash
cd "${HOME}"/.node-red
npm install --production @halsystems/red-bacnet
```
### Example
See <a href="https://flows.nodered.org/flow/45a1c893a2acd0dc9df7c7b91b82bfe6" target="_blank">here</a>

## Contributions
This package is based on two projects:
- ts-node-bacstack (v1.0.0-beta.2): A direct dependency for this package. (https://github.com/HILA-TECH/ts-node-bacstack)
- node-bacstack: The original JavaScript implementation that laid the groundwork for BACnet communication in Node.js environments. (https://github.com/fh1ch/node-bacstack)

## License
MIT
Copyright (c) 2024-present [HAL Systems](https://www.halsystems.com.au/)
