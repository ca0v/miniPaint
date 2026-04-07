# Preserve Audit Trail from PMEditedPhotoEvents Hidden Field

## Problem

When the app is loaded with a pre-existing value in the `PMEditedPhotoEvents` hidden form field (representing past editing events), `app.auditTrail` starts as an empty array. Any new events pushed during the session overwrite the past events when saved, because `saveToImage()` joins only the current in-memory array and writes it back to the form field.

## Solution

Introduce a helper method `app.pushAuditTrail(event)` that seeds `app.auditTrail` from the hidden form field on first use, then pushes the new event. Replace all direct `app.auditTrail.push(...)` calls with the helper.

## Steps

### 1. Add `pushAuditTrail` helper to `app` object

**File:** `src/js/app.js`

Add a `pushAuditTrail` method to the `app` object. On the first call (when `app.auditTrail` is empty), read `$('#PMEditedPhotoEvents').val()`, split by `";"`, filter out empty strings, and push each past event onto the array before pushing the new event.

```js
pushAuditTrail(event) {
    if (this.auditTrail.length === 0) {
        var existing = $('#PMEditedPhotoEvents').val();
        if (existing) {
            existing.split(';').filter(e => e.length > 0).forEach(e => {
                this.auditTrail.push(e);
            });
        }
    }
    this.auditTrail.push(event);
}
```

### 2. Replace `app.auditTrail.push(...)` in `do_action`

**File:** `src/js/core/base-state.js` — line 81

```diff
- app.auditTrail.push(this.asAuditTrail(action));
+ app.pushAuditTrail(this.asAuditTrail(action));
```

### 3. Replace `app.auditTrail.push(...)` in `redo_action`

**File:** `src/js/core/base-state.js` — line 161

```diff
- app.auditTrail.push(`redo: ${action.action_id}`)
+ app.pushAuditTrail(`redo: ${action.action_id}`)
```

### 4. Replace `app.auditTrail.push(...)` in `undo_action`

**File:** `src/js/core/base-state.js` — line 172

```diff
- app.auditTrail.push(`undo: ${this.action_history[this.action_history_index]?.action_id}`)
+ app.pushAuditTrail(`undo: ${this.action_history[this.action_history_index]?.action_id}`)
```

### 5. No changes needed to `saveToImage`

**File:** `src/js/modules/file/save.js` — `saveToImage()` function (line 889)

The existing join logic already produces the correct output — it will now join past events (seeded from the form field) with any new events recorded during the session.

```js
const auditTrail = app.auditTrail.join(";");
```

No change required here.

## References

| Location | Current code | Action |
|---|---|---|
| `src/js/app.js:11` | `auditTrail: []` | Add `pushAuditTrail` method |
| `src/js/core/base-state.js:81` | `app.auditTrail.push(this.asAuditTrail(action))` | Use `app.pushAuditTrail(...)` |
| `src/js/core/base-state.js:161` | `app.auditTrail.push(\`redo: ...\`)` | Use `app.pushAuditTrail(...)` |
| `src/js/core/base-state.js:172` | `app.auditTrail.push(\`undo: ...\`)` | Use `app.pushAuditTrail(...)` |
| `src/js/modules/file/save.js:890` | `app.auditTrail.join(";")` | No change |
