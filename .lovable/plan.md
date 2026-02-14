

# Fix: MGF Robot Download Capture

## Problem
The MGF portal generates reports as inline HTML in a new tab, unlike Cobranca which triggers a browser download event. The MGF robot has inline content polling code to handle this, but it never executes because exceptions are silently swallowed by a catch-all block (`catch (err) { // Ignorar erros }`).

## Root Cause
In `criarWatcherNovaAba` (scripts/robo-mgf-hinova.cjs), the `processarNovaAba` function:
1. Sets up a download listener on the new tab
2. Waits for `domcontentloaded` (up to 8s)
3. Searches for download buttons
4. **Should** start inline content polling if no download was captured

But the entire function is wrapped in `catch (err) { // Ignorar erros }`, so if any step before the polling throws (e.g., `waitForLoadState` or button search), the polling never runs and no error is logged.

## Fix (scripts/robo-mgf-hinova.cjs)

### 1. Add error logging to the catch block
Replace the silent `catch (err) {}` with proper logging so failures become visible in the GitHub Actions output.

### 2. Isolate inline polling from earlier errors
Move the inline polling into its own try/catch so it runs even if `waitForLoadState` or button search fails. The polling is the critical fallback for MGF.

### 3. Add progress logging to inline polling
Log the new tab URL and content length during each poll cycle so we can diagnose if the portal is still generating the report or if the tab was redirected/closed.

### 4. Lower the minimum content threshold
The current check requires `pageContent.length > 5000`. Some MGF reports may render progressively. Add an intermediate log at lower thresholds (e.g., 1000 chars) to track portal progress.

---

## Technical Details

**File**: `scripts/robo-mgf-hinova.cjs`

**Change 1** - Line ~1625: Replace silent catch
```javascript
// BEFORE
} catch (err) {
  // Ignorar erros
}

// AFTER
} catch (err) {
  log(`Erro no processamento da nova aba: ${err.message}`, LOG_LEVELS.ERROR);
}
```

**Change 2** - Lines ~1529-1555: Wrap pre-polling steps in their own try/catch
```javascript
// Wrap waitForLoadState + button search in isolated try/catch
try {
  await Promise.race([
    newPage.waitForLoadState('domcontentloaded', { timeout: 8000 }),
    new Promise(resolve => setTimeout(resolve, 8000)),
  ]).catch(() => {});
  
  // ... button search logic ...
} catch (preErr) {
  log(`Erro pre-polling (ignorado): ${preErr.message}`, LOG_LEVELS.WARN);
}

// Inline polling runs REGARDLESS of above errors
if (!controller.isCaptured() && !downloadFiredInTab) {
  // ... polling logic ...
}
```

**Change 3** - Add URL logging in polling loop
```javascript
log(`⏳ Polling inline: URL=${newPage.url()}, ${pageContent.length} chars`, LOG_LEVELS.DEBUG);
```

These changes ensure the inline content polling always runs for MGF, making it reliably capture HTML reports rendered in new tabs -- the same behavior that makes Cobranca successful (via different capture strategy).

