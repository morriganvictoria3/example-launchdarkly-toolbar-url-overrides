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
     * Serialize a value for URL storage
     * Adds quotes to strings that would be interpreted as other JSON types
     */
    function serializeValue(value) {
        if (typeof value === 'string') {
            // Check if the string would be parsed as a different type
            try {
                const parsed = JSON.parse(value);
                // If parsing succeeds and changes the type, we need to quote it
                if (typeof parsed !== 'string') {
                    return JSON.stringify(value);
                }
            } catch (e) {
                // Not valid JSON, just a regular string
            }
            // For regular strings, just return as-is (no extra quotes)
            return value;
        }
        // For non-strings (booleans, numbers, objects), use JSON.stringify
        return JSON.stringify(value);
    }

    /**
     * Sync overrides to URL using replaceState
     */
    function syncOverridesToUrl(overrides) {
        try {
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
                params.set(`${parameterPrefix}${flagKey}`, serializeValue(value));
            });

            // Update URL without reloading or creating history entry
            window.history.replaceState({}, '', url.toString());
        } catch (error) {
            logger.error('Failed to sync overrides to URL:', error);
        }
    }

    // Monkey patch setOverride to sync to URL
    const originalSetOverride = plugin.setOverride.bind(plugin);
    plugin.setOverride = function(flagKey, value) {
        originalSetOverride(flagKey, value);
        syncOverridesToUrl(this.getAllOverrides());
    };

    // Monkey patch removeOverride to sync to URL
    const originalRemoveOverride = plugin.removeOverride.bind(plugin);
    plugin.removeOverride = function(flagKey) {
        originalRemoveOverride(flagKey);
        syncOverridesToUrl(this.getAllOverrides());
    };

    // Monkey patch clearAllOverrides to sync to URL
    const originalClearAllOverrides = plugin.clearAllOverrides.bind(plugin);
    plugin.clearAllOverrides = function() {
        originalClearAllOverrides();
        syncOverridesToUrl(this.getAllOverrides());
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

    // Add helper method to sync initial overrides to URL
    plugin.syncInitialOverrides = function() {
        const initialOverrides = this.getAllOverrides();
        if (Object.keys(initialOverrides).length > 0) {
            syncOverridesToUrl(initialOverrides);
        }
    };

    return plugin;
}
