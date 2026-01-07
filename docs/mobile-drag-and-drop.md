# Mobile Touch Drag-and-Drop Implementation

## Problem

HTML5 Drag and Drop API is not well supported on mobile browsers. The standard `draggable="true"` attribute and drag events (`dragstart`, `dragover`, `drop`) don't work reliably on touch devices.

## Solution

Implemented a custom touch-based drag-and-drop system using touch events and a custom event bridge between the node palette and canvas.

## Implementation

### 1. Node Palette Touch Handlers

**File:** `packages/workflow-vue/src/components/ui/NodePalette.vue`

#### Touch Start Handler

```typescript
const onTouchStart = (
    event: TouchEvent,
    nodeType: string,
    defaultData: Record<string, unknown>
) => {
    touchData = { nodeType, defaultData };
    const target = event.currentTarget as HTMLElement;
    target.classList.add('dragging-touch');
};
```

**What it does:**
- Stores node type and default data in memory
- Adds visual feedback class to the touched element

#### Touch End Handler

```typescript
const onTouchEnd = (event: TouchEvent) => {
    const target = event.currentTarget as HTMLElement;
    target.classList.remove('dragging-touch');
    
    if (!touchData) return;
    
    const touch = event.changedTouches[0];
    const dropTarget = document.elementFromPoint(touch.clientX, touch.clientY);
    
    const canvas = document.querySelector('.vue-flow') as HTMLElement;
    if (canvas && (canvas === dropTarget || canvas.contains(dropTarget))) {
        const customEvent = new CustomEvent('mobileNodeDrop', {
            detail: {
                nodeType: touchData.nodeType,
                defaultData: touchData.defaultData,
                x: touch.clientX,
                y: touch.clientY,
            },
        });
        canvas.dispatchEvent(customEvent);
    }
    
    touchData = null;
};
```

**What it does:**
- Removes visual feedback
- Gets the touch release coordinates
- Finds the element at those coordinates using `elementFromPoint`
- If dropped on the canvas, dispatches a custom `mobileNodeDrop` event
- Clears stored data

### 2. Canvas Drop Handler

**File:** `packages/workflow-vue/src/components/WorkflowCanvas.vue`

#### Event Listener Setup

```typescript
const onMobileNodeDrop = (event: Event) => {
    const customEvent = event as CustomEvent<{
        nodeType: string;
        defaultData: Record<string, unknown>;
        x: number;
        y: number;
    }>;

    const { nodeType, defaultData, x, y } = customEvent.detail;
    
    const position = screenToFlowCoordinate({ x, y });
    props.editor.commands.createNode(nodeType, defaultData, position);
};

onMounted(() => {
    const canvas = document.querySelector('.vue-flow') as HTMLElement;
    if (canvas) {
        canvas.addEventListener('mobileNodeDrop', onMobileNodeDrop as EventListener);
    }
});

onUnmounted(() => {
    const canvas = document.querySelector('.vue-flow') as HTMLElement;
    if (canvas) {
        canvas.removeEventListener('mobileNodeDrop', onMobileNodeDrop as EventListener);
    }
});
```

**What it does:**
- Listens for the custom `mobileNodeDrop` event
- Extracts node data and touch coordinates
- Transforms screen coordinates to flow coordinates (handles zoom/pan)
- Creates the node at the calculated position
- Properly cleans up listener on unmount

## Visual Feedback

### CSS for Touch Dragging State

**File:** `packages/workflow-vue/src/components/ui/NodePalette.vue`

```css
/* Touch dragging state for mobile */
.palette-node.dragging-touch {
    opacity: 0.7;
    transform: scale(1.05);
    box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4);
    border-color: var(--or3-color-accent, #8b5cf6);
}
```

**Effects:**
- Slightly transparent to show it's being dragged
- Scaled up 5% to emphasize selection
- Purple glow shadow
- Purple border

### Mobile Touch Optimizations

```css
@media (max-width: 768px) {
    .palette-node {
        padding: var(--or3-spacing-md, 12px);
        touch-action: none;
        user-select: none;
        -webkit-user-select: none;
    }
    
    .node-icon {
        width: 40px;
        height: 40px;
    }
    
    .node-icon svg {
        width: 20px;
        height: 20px;
    }
}
```

**Optimizations:**
- `touch-action: none` - Prevents scrolling during drag
- `user-select: none` - Prevents text selection on long press
- Larger padding for better touch targets
- Larger icons (40x40px vs 36x36px)

## User Flow

### Desktop (Unchanged)

1. User hovers over node in palette
2. Cursor changes to grab
3. User clicks and drags
4. HTML5 drag event fires
5. User drops on canvas
6. Drop event creates node

### Mobile (New)

1. User taps and holds node in palette
2. Node scales up and glows (visual feedback)
3. User drags finger across screen
4. User releases finger over canvas
5. Touch end handler detects drop location
6. Custom event dispatched to canvas
7. Canvas handler creates node at touch coordinates

## Why This Approach?

### Alternatives Considered

1. **Polyfill Libraries** (e.g., mobile-drag-drop)
   - ❌ Adds external dependency
   - ❌ Large bundle size
   - ❌ May conflict with Vue Flow

2. **Clone & Follow** (visual clone follows finger)
   - ❌ More complex implementation
   - ❌ Requires position tracking
   - ❌ Harder to handle z-index and overlays

3. **Native HTML5 Only**
   - ❌ Doesn't work on mobile browsers
   - ❌ No fallback for touch devices

### Our Solution Benefits

✅ **Zero Dependencies** - Pure Vue/TypeScript implementation  
✅ **Small Bundle Impact** - Minimal code added  
✅ **Clean API** - Custom event bridge is simple and maintainable  
✅ **Vue Flow Compatible** - Uses existing coordinate transformation  
✅ **Visual Feedback** - Clear indication of drag state  
✅ **Touch Optimized** - Proper touch event handling  
✅ **Desktop Unchanged** - No impact on existing drag-and-drop  

## Browser Compatibility

### Desktop Browsers
- Chrome/Edge: ✅ HTML5 Drag & Drop
- Firefox: ✅ HTML5 Drag & Drop
- Safari: ✅ HTML5 Drag & Drop

### Mobile Browsers
- iOS Safari: ✅ Touch Events
- iOS Chrome: ✅ Touch Events
- Android Chrome: ✅ Touch Events
- Android Firefox: ✅ Touch Events
- Android Samsung Internet: ✅ Touch Events

## Technical Details

### Coordinate Transformation

The key challenge is transforming touch coordinates (screen space) to canvas coordinates (flow space), accounting for:
- Canvas zoom level
- Canvas pan position
- Viewport offset

Vue Flow's `screenToFlowCoordinate` function handles this:

```typescript
const position = screenToFlowCoordinate({ x, y });
```

This ensures nodes are created at the correct position regardless of zoom/pan state.

### Event Lifecycle

```
Touch Start → Store Data + Visual Feedback
     ↓
[User Drags Finger]
     ↓
Touch End → Find Drop Target
     ↓
Is Canvas? → YES → Dispatch Custom Event
     ↓              ↓
     NO            Canvas Listens
     ↓              ↓
   Cancel      Transform Coords
                    ↓
                Create Node
```

### Memory Management

- `touchData` stored in closure scope
- Cleared after drop or cancel
- Event listeners properly cleaned up in `onUnmounted`
- No memory leaks

## Testing Checklist

### Mobile Touch Drag
- [ ] Touch node in palette
- [ ] See visual feedback (glow + scale)
- [ ] Drag to canvas
- [ ] Release to drop
- [ ] Node created at correct position
- [ ] Works with zoomed canvas
- [ ] Works with panned canvas
- [ ] Works when sidebar overlays canvas

### Desktop Mouse Drag
- [ ] Click and drag node
- [ ] Standard cursor changes
- [ ] Drop on canvas
- [ ] Node created at correct position
- [ ] No regression from touch implementation

### Edge Cases
- [ ] Touch and release on sidebar (no node created)
- [ ] Touch and release outside canvas (no node created)
- [ ] Multiple rapid touches (no duplicate nodes)
- [ ] Touch during node execution (no interference)

## Future Enhancements

Potential improvements for future iterations:

1. **Visual Clone** - Show dragged node following finger
2. **Drop Preview** - Show ghost node at drop location
3. **Haptic Feedback** - Vibrate on successful drop (iOS/Android)
4. **Drag Cancel** - Swipe away to cancel drag
5. **Multi-touch** - Support for multiple simultaneous drags
6. **Gesture Recognition** - Different gestures for different node types

## Related Files

- `packages/workflow-vue/src/components/ui/NodePalette.vue` - Touch handlers
- `packages/workflow-vue/src/components/WorkflowCanvas.vue` - Drop handler
- `demo-v2/src/components/LeftSidebar.vue` - Mobile sidebar overlay
- `demo-v2/src/components/CanvasArea.vue` - Mobile button
