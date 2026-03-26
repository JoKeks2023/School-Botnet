# Product Scope

## Purpose

School-Botnet is a legal classroom demo system for distributed compute experiments.

The system is designed for transparent, supervised educational use cases:

- demonstrate distributed task coordination
- show live progress across multiple clients
- test simple chunk-based compute workflows

## Explicitly Allowed

- classroom demonstrations
- internal lab or workshop environments
- controlled test datasets and synthetic workloads
- visible, user-initiated client participation

## Explicitly Not Allowed

- hidden execution on third-party systems
- unauthorized access or persistence
- malware-like behavior
- self-propagation
- abuse of external infrastructure

## User Roles

- Admin: creates rooms, issues confirmation codes, starts/stops tasks, monitors status
- Client: joins with room code + one-time confirmation code and executes assigned chunks

## Current MVP Boundaries

- single Node.js server process with in-memory state
- browser-based admin and client UIs
- no persistent database
- no multi-tenant auth model
- no advanced scheduling fairness guarantees

## Future Expansion Boundaries

The project can expand into stronger persistence and reliability, but must keep:

- explicit user consent
- transparent operation
- narrow workload allowlist
- no offensive capability
