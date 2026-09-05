# TrustVault Animation Update — Ground-Truth Design Spec

This project reproduces the visual language and interaction from the provided TrustVault target. Fidelity to the observed reference behavior takes priority over introducing a new visual direction.

## Reference Spec

The target uses an editorial cream interface with a dark proof-field hero panel. The hero contains a centered TrustVault core, faint orbital rings, constellation-like proof nodes, a star field, and compact mono labels. The animation is a click/tap-driven shield activation state:

1. The TrustVault core is clickable and toggles between sealed and active states.
2. On activation, a translucent spherical aura and a wireframe icosahedron appear from near-zero-but-not-zero scale, fade in, and settle with a small overshoot pulse.
3. A brief expanding wireframe pulse radiates outward from the TrustVault core and fades away.
4. The active wireframe rotates subtly on the Y axis and tilts gently over time.
5. Two orbital rings continue slow counter-rotation at different speeds.
6. The page status changes from `TRUSTVAULT IDLE · FIELD SEALED` to `SHIELD ACTIVE · IDENTITY FIELD UNSEALED`.
7. The hint changes from `TAP TRUSTVAULT TO RAISE ITS SHIELD` to `TAP TRUSTVAULT TO SEAL ITS SHIELD`.
8. A separate button toggles the same state.
9. Motion is limited to transform and opacity, supports reduced-motion preferences, and preserves the target’s dark teal / mint / electric-blue palette.

## Design Philosophy

### Design Movement
Neo-editorial cybernetic interface: restrained Swiss editorial structure combined with low-light observability-console graphics.

### Core Principles
- The cream page is calm and inspectable; the proof field is the high-contrast operational window.
- Motion communicates system state rather than decoration.
- Labels and lines behave like evidence annotations, not generic UI chrome.
- Every active state has a visible, textual consequence.

### Color Philosophy
Use warm paper (`#f5f2e9`) as the human-facing surface and near-black teal (`#04090d`) as the machine-facing proof field. Mint-teal marks valid or active trust relationships; electric blue is reserved for ownership and primary action emphasis. Avoid gradients that obscure the evidence-like geometry.

### Layout Paradigm
Preserve the asymmetric split hero: chapter rail and editorial copy on the left, proof field on the right. The TrustVault core remains the visual anchor inside the right panel, while proof nodes orbit as distributed evidence rather than a centered card grid.

### Signature Elements
- Fine orbital rings with opposing rotational movement.
- Numbered proof nodes connected to the TrustVault core by thin lines.
- A shield activation aura made of translucent sphere + wireframe polyhedron + expanding pulse.

### Interaction Philosophy
Interactions should feel like changing an auditable system state: a click is acknowledged immediately, the TrustVault core responds with a controlled activation pulse, labels update, and the action can be reversed.

### Animation
Use a snappy exponential ease toward the target activation progress. Activation starts with `progress = 0`, an impulse pulse at `0.001`, and a short expansion/fade. The aura settles around `1.0 + sin(progress * PI) * 0.12`; the wireframe scales to `1.01x` the aura, rotates at roughly `0.25 rad/s`, and rocks on X with a slow `sin(time * 0.4) * 0.08`. The impulse expands from `0.4` to `3.0` scale and fades to zero. Idle orbit rings counter-rotate at approximately `+0.18` and `-0.26` rad/s.

### Typography System
Use Space Grotesk for large editorial headlines, DM Sans for readable interface copy, and IBM Plex Mono for labels, chapter markers, status text, and proof annotations.

### Brand Essence
TrustVault is an inspectable trust-infrastructure atlas for teams that need identity, access, and ownership boundaries to leave verifiable evidence. Personality: **precise, watchful, grounded**.

### Brand Voice
Headlines are declarative and compact. CTAs sound like deliberate operations, not marketing promises. Microcopy names the system state plainly.

Example lines:
- `Trace the proof path`
- `Every authority boundary leaves a trace.`

### Wordmark & Logo
Use the existing compact TRUST / VAULT lockup with a shield-mark symbol. Keep the mark geometric and small enough to act as a system seal, but clearly visible in the header.

### Signature Brand Color
Mint-teal `#8df0d0` is the ownable active-state color: it marks a relationship that is live, verified, and inspectable.
