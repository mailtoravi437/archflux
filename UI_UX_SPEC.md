# ArchFlux UI/UX Design Specification

## Design Principles
1. **Function-first taxonomy** — users think "I need a database" not "I need an AWS database"
2. **Excalidraw-inspired interactions** — inline editing, contextual toolbars, minimal chrome
3. **Progressive disclosure** — show only what's relevant, hide advanced options
4. **Visual hierarchy** — clear information architecture with consistent patterns
5. **Keyboard-first** — every action has a shortcut, power users never touch the mouse

---

## 1. Shape Library Redesign

### Current Problem
Provider-first taxonomy (General/AWS/GCP/Azure/Data) forces users to pick a vendor before finding a shape. All 12 AWS shapes render in a single undifferentiated grid.

### New Taxonomy (Function-first)

**Primary axis: Functional category**
| Category | Shapes | Icon |
|---|---|---|
| Compute | EC2, Lambda, ECS, Cloud Run, GKE, AKS, VM, Functions | ⚙️ |
| Storage | S3, GCS, Blob, EBS, Cloud Storage | 📦 |
| Database | RDS, DynamoDB, Cloud SQL, BigQuery, Cosmos, PostgreSQL, MongoDB, Redis, Elasticsearch | 🗄️ |
| Network | API Gateway, ALB, CloudFront, Load Balancer, Front Door, VPC, Service Mesh | 🌐 |
| Messaging | SQS, SNS, Pub/Sub, Service Bus, Kafka, RabbitMQ | 📨 |
| Security | IAM, OIDC, Vault, WAF | 🔐 |
| Observability | CloudWatch, Datadog, Prometheus | 📊 |
| General | Microservice, API Gateway, Database, Event Stream | 📦 |

**Secondary axis: Provider filter** (pills at top)
All | AWS | GCP | Azure | Multi-cloud | Data/Infra

**Tertiary: Recently used** (horizontal strip at top of drawer)

### Shape Picker UX
- Single "Shapes" button in tool rail opens drawer
- Drawer has: Recently Used strip → Category sections → Provider filter pills
- Each shape shows: visual thumbnail (mini rectangle with icon) + label + tag
- Click to place at canvas center, or drag onto canvas
- Search filters across all categories
- Provider pills show count badges: "AWS (12)"

### Tool Rail Redesign
Group buttons visually with subtle separators:
```
[Select] [Pan]     ← Navigation
[Draw] [Text]      ← Creation
[Service] [Gateway] [DB] [Queue]  ← Quick shapes
[Connect] [Note]   ← Annotation
[📚 Shapes]        ← Library drawer
```

---

## 2. Canvas Screen Improvements

### Inline Text Editing
- Double-click a node → edit label directly on canvas (textarea overlay)
- Double-click an edge → edit label directly on canvas
- Enter to confirm, Escape to cancel
- No need to switch to inspector for quick renames

### Contextual Floating Toolbar
When a node is selected, show a small floating toolbar near it:
- Fill color swatches (4-5 colors)
- Border color swatches
- Stroke width toggle
- Duplicate | Delete

### Drag-to-Resize
- Nodes can be resized by dragging their edges/corners
- Minimum size: 100x50, Maximum: 400x200
- Hold Shift to maintain aspect ratio

### Inspector/Linter Split View
- Right dock shows Inspector on top, Linter on bottom (resizable split)
- Both visible simultaneously — no tab switching
- Collapse either section independently

### Smart Alignment Guides
- When dragging nodes, show alignment guides (dashed lines) when edges align
- Snap to alignment within 5px

### Undo/Redo in Canvas
- Move undo/redo buttons to bottom-left of canvas (near zoom controls)
- Show stack depth tooltip on hover

### Minimap Toggle
- Small button to show/hide minimap
- Default: visible on large diagrams, hidden on small

### Zoom to Selection
- Shift+F or button in multi-select toolbar
- Frames selected nodes at readable zoom level

---

## 3. Onboarding Redesign

### Skip Option
- "Skip for now" link in top-right corner of every step
- Skipping goes directly to canvas with default settings

### 4th Persona Card
- "Other / Not sure — show me everything" option
- Shows all blueprints regardless of persona

### Provider Selection Preview
- After step 2, show: "Your shape library will show: [AWS icons] [GCP icons] — 32 shapes"
- Visual confirmation of the effect

### Blueprint Thumbnails
- Mini SVG previews in step 3 (not just title + description)

### User-Facing Footer
- Replace "Writes archflux:onboarded = true" with "You can change these anytime in Settings"

---

## 4. Dashboard Redesign

### Favorites/Pinning
- Pin important diagrams to the top
- Star icon on each card to toggle pin
- Pinned diagrams appear in a "Pinned" section

### Multi-Select Mode
- Checkbox on each card (appears on hover or in select mode)
- Bulk actions: delete, tag, export
- "Select all" checkbox in header

### Recently Opened Section
- Top 3-5 most recently opened diagrams
- Horizontal strip above the main grid

### Visual Empty State
- Dashed-outline canvas illustration with "Create your first diagram" CTA
- Not just a text card

### Remove Redundant "From Template" Button
- Blueprints is already in the nav tabs
- Remove from dashboard quick actions

---

## 5. Living Screen Redesign

### Dynamic Drift Data
- Generate drift from actual canvas state vs. simulated upstream
- Accepting drift highlights the affected node on canvas
- Drift lines change based on actual differences

### Connector Configuration Modal
- When adding a connector, show a modal with:
  - Name, type (K8s/OpenAPI/Terraform)
  - Cluster/namespace/repo fields
  - Credentials (if applicable)

### "Sync Now" Button
- In the status overview card, not just the drift card

---

## 6. Reviews Screen Redesign

### Dynamic PR Title
- Derive from active document or allow user to set it
- Not hardcoded "PR #104"

### Dynamic Reviewer State
- Load from team settings
- Show actual approval status

### Visual Diff View
- Side-by-side or overlay comparison for checkpoints
- Not just text diff

---

## 7. Git Screen Redesign

### Dynamic PR Data
- Generate PRs from checkpoint history
- Not static mock data

### Functional Merge
- Actually change PR status on merge
- Create a merge commit entry

### Branch Visualization
- Simple linear commit history
- Branch indicators

---

## 8. Blueprints Screen Redesign

### SVG Thumbnails
- Generate actual thumbnails from blueprint graph data
- Like the dashboard does for diagrams

### Edge List in Preview
- Show edges in the preview modal, not just nodes

### Save as Blueprint
- Allow users to save current diagram as a reusable blueprint

---

## 9. Settings Redesign

### Setting Descriptions
- Tooltip or help text for each setting
- Explain what "Snap threshold" or "Connector curve" does

### Live Preview Panel
- Mini canvas snippet showing current style
- Updates as settings change

### Shortcut Conflict Detection
- Warn if user binds same key to multiple actions

### Reset All Settings
- Single button to reset everything to defaults

---

## 10. Navigation Redesign

### Standardized Tab Labels
- "Library" | "Canvas" | "Sync" | "Reviews" | "Blueprints" | "Settings"
- All short nouns, consistent naming

### Settings Badge
- Show badge for configuration issues (token not configured, etc.)

### Sub-Screen Breadcrumb
- "Settings > Connectors" in header

### User Avatar/Profile
- Show signed-in user in top-right
- Dropdown with profile, settings, sign out

### Hide Undo/Redo on Non-Canvas
- Only show on canvas screen

---

## Implementation Priority

### Phase 1: Shape Library (P0)
1. Reorganize shape taxonomy to function-first
2. Implement folder-based shape picker
3. Add recently-used section
4. Add visual thumbnails

### Phase 2: Canvas UX (P0)
1. Inline text editing
2. Contextual floating toolbar
3. Drag-to-resize
4. Inspector/Linter split view

### Phase 3: Onboarding (P0)
1. Skip option
2. 4th persona card
3. Provider selection preview

### Phase 4: Dashboard (P1)
1. Favorites/pinning
2. Multi-select mode
3. Recently opened section

### Phase 5: Dynamic Data (P0)
1. Living screen dynamic drift
2. Reviews dynamic PR data
3. Git dynamic PR data

### Phase 6: Polish (P1-P2)
1. Settings descriptions
2. Blueprint thumbnails
3. Navigation standardization
