import { FlagOverridePlugin } from '@launchdarkly/toolbar';

/**
 * Creates a FlagOverridePlugin wrapper that syncs overrides to/from URL parameters
 *
 * @param {Object} options - Configuration options
 * @param {string} options.parameterPrefix - Prefix for URL parameters (default: 'ld_override_')
 * @param {Object} options.overrideOptions - Options to pass to the underlying FlagOverridePlugin
 * @param {Function} options.logger - Optional logger function for debugging
 * @returns {Object} A wrapped FlagOverridePlugin with URL sync capabilities
 */
export function createFlagUrlOverridePlugin(options = {}) {
    const {
        parameterPrefix = 'ld_override_',
        overrideOptions = {},
        logger = console
    } = options;

    // Create the underlying plugin
    const plugin = new FlagOverridePlugin(overrideOptions);

    // Store reference to client for display updates
    let ldClient = null;
    let updateDisplayCallback = null;

    /**
     * Load overrides from URL query parameters
     */
    function loadOverridesFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        const overrides = {};

        for (const [key, value] of urlParams.entries()) {
            if (key.startsWith(parameterPrefix)) {
                const flagKey = key.replace(parameterPrefix, '');
                try {
                    // Try to parse as JSON
                    overrides[flagKey] = JSON.parse(value);
                } catch (e) {
                    // If parsing fails, treat as string
                    overrides[flagKey] = value;
                }
            }
        }

        return overrides;
    }

    /**
     * Sync overrides to URL using replaceState
     */
    function syncOverridesToUrl(overrides) {
        try {
            logger.log('[syncOverridesToUrl] Called with overrides:', overrides);
            const url = new URL(window.location.href);
            const params = url.searchParams;

            // Remove all existing override parameters
            const keysToRemove = [];
            for (const key of params.keys()) {
                if (key.startsWith(parameterPrefix)) {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach(key => params.delete(key));

            // Add current overrides
            Object.entries(overrides).forEach(([flagKey, value]) => {
                params.set(`${parameterPrefix}${flagKey}`, JSON.stringify(value));
            });

            // Update URL without reloading or creating history entry
            logger.log('[syncOverridesToUrl] About to call replaceState with URL:', url.toString());
            window.history.replaceState({}, '', url.toString());
            logger.log('[syncOverridesToUrl] Successfully updated URL');
        } catch (error) {
            logger.error('[syncOverridesToUrl] Error:', error);
        }
    }

    // Monkey patch setOverride to sync to URL and update display
    const originalSetOverride = plugin.setOverride.bind(plugin);
    plugin.setOverride = function(flagKey, value) {
        logger.log('[setOverride] Called with flagKey:', flagKey, 'value:', value);
        originalSetOverride(flagKey, value);
        logger.log('[setOverride] About to sync to URL');
        syncOverridesToUrl(this.getAllOverrides());
        // Notify callback if registered
        if (updateDisplayCallback) {
            updateDisplayCallback(flagKey, 'set');
        }
        logger.log('[setOverride] Completed');
    };

    // Monkey patch removeOverride to sync to URL and update display
    const originalRemoveOverride = plugin.removeOverride.bind(plugin);
    plugin.removeOverride = function(flagKey) {
        originalRemoveOverride(flagKey);
        syncOverridesToUrl(this.getAllOverrides());
        // Notify callback if registered
        if (updateDisplayCallback) {
            updateDisplayCallback(flagKey, 'remove');
        }
    };

    // Monkey patch clearAllOverrides to sync to URL and refresh all flags
    const originalClearAllOverrides = plugin.clearAllOverrides.bind(plugin);
    plugin.clearAllOverrides = function() {
        originalClearAllOverrides();
        syncOverridesToUrl(this.getAllOverrides());
        // Notify callback if registered
        if (updateDisplayCallback) {
            updateDisplayCallback(null, 'clear');
        }
    };

    // Monkey patch registerDebug to load URL overrides
    const originalRegisterDebug = plugin.registerDebug.bind(plugin);
    plugin.registerDebug = function(debugOverride) {
        // Call original implementation first
        originalRegisterDebug(debugOverride);

        // Load overrides from URL and apply them (using original method to avoid recursion)
        const urlOverrides = loadOverridesFromUrl();
        Object.entries(urlOverrides).forEach(([flagKey, value]) => {
            logger.info(`Loading override from URL: ${flagKey} = ${JSON.stringify(value)}`);
            originalSetOverride(flagKey, value);
        });

        if (Object.keys(urlOverrides).length > 0) {
            logger.info(`Loaded ${Object.keys(urlOverrides).length} overrides from URL`);
        }
    };

    // Add helper method to register display update callback
    plugin.onOverrideChange = function(callback) {
        updateDisplayCallback = callback;
    };

    // Add helper method to sync initial overrides to URL
    plugin.syncInitialOverrides = function() {
        const initialOverrides = this.getAllOverrides();
        if (Object.keys(initialOverrides).length > 0) {
            syncOverridesToUrl(initialOverrides);
        }
    };

    return plugin;
}
