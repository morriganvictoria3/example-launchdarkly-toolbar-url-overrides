import * as LDClient from 'launchdarkly-js-client-sdk';
import { EventInterceptionPlugin } from '@launchdarkly/toolbar';
import { createFlagUrlOverridePlugin } from './flag-url-override-plugin.js';

// Custom Logger Implementation
class CustomLogger {
    constructor(logContainerId) {
        this.logContainer = document.getElementById(logContainerId);
    }

    log(level, ...args) {
        const timestamp = new Date().toLocaleTimeString();
        const message = args.join(' ');
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry log-${level}`;
        logEntry.innerHTML = `<span class="timestamp">[${timestamp}]</span> [${level.toUpperCase()}] ${this.escapeHtml(message)}`;

        this.logContainer.appendChild(logEntry);

        // Auto-scroll to bottom
        this.logContainer.scrollTop = this.logContainer.scrollHeight;

        // Also log to console for debugging
        console[level] ? console[level](...args) : console.log(...args);
    }

    debug(...args) {
        this.log('debug', ...args);
    }

    info(...args) {
        this.log('info', ...args);
    }

    warn(...args) {
        this.log('warn', ...args);
    }

    error(...args) {
        this.log('error', ...args);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize custom logger
const logger = new CustomLogger('logs-container');

// Get client-side ID from query parameter
function getClientSideIdFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('clientSideId') || '';
}

// Helper function to format reason object
function formatReason(reason) {
    if (!reason) return 'N/A';
    if (typeof reason === 'string') return reason;
    if (typeof reason === 'object') {
        // Extract the kind and other relevant details
        const parts = [reason.kind || 'UNKNOWN'];
        if (reason.ruleIndex !== undefined) parts.push(`rule: ${reason.ruleIndex}`);
        if (reason.ruleId) parts.push(`ruleId: ${reason.ruleId}`);
        if (reason.prerequisiteKey) parts.push(`prerequisite: ${reason.prerequisiteKey}`);
        return parts.join(', ');
    }
    return String(reason);
}

// Function to display flags
function displayFlags(client, overridePlugin = null) {
    const flagsContainer = document.getElementById('flags-container');
    flagsContainer.innerHTML = '';

    const allFlags = client.allFlags();
    const flagKeys = Object.keys(allFlags);

    if (flagKeys.length === 0) {
        flagsContainer.innerHTML = '<p>No flags available</p>';
        return;
    }

    logger.info(`Displaying ${flagKeys.length} flags`);

    // Get all active overrides
    const activeOverrides = overridePlugin ? overridePlugin.getAllOverrides() : {};

    flagKeys.forEach(key => {
        const detail = client.variationDetail(key, null);
        const hasOverride = key in activeOverrides;

        const flagItem = document.createElement('div');
        flagItem.className = 'flag-item';
        flagItem.id = `flag-${key}`;

        flagItem.innerHTML = `
            <div class="flag-name">
                ${key}
                ${hasOverride ? '<span class="override-badge">OVERRIDE</span>' : ''}
            </div>
            <div class="flag-value">Value: <strong>${JSON.stringify(detail.value)}</strong></div>
            <div class="flag-reason">Reason: ${formatReason(detail.reason)} ${detail.variationIndex !== undefined ? `(variation: ${detail.variationIndex})` : ''}</div>
        `;

        flagsContainer.appendChild(flagItem);
    });
}

// Function to update a single flag display
function updateFlagDisplay(client, flagKey, overridePlugin = null) {
    const detail = client.variationDetail(flagKey, null);
    const flagElement = document.getElementById(`flag-${flagKey}`);

    if (flagElement) {
        const activeOverrides = overridePlugin ? overridePlugin.getAllOverrides() : {};
        const hasOverride = flagKey in activeOverrides;

        flagElement.innerHTML = `
            <div class="flag-name">
                ${flagKey}
                ${hasOverride ? '<span class="override-badge">OVERRIDE</span>' : ''}
            </div>
            <div class="flag-value">Value: <strong>${JSON.stringify(detail.value)}</strong></div>
            <div class="flag-reason">Reason: ${formatReason(detail.reason)} ${detail.variationIndex !== undefined ? `(variation: ${detail.variationIndex})` : ''}</div>
        `;

        // Add a brief highlight animation
        flagElement.style.backgroundColor = '#fff3cd';
        setTimeout(() => {
            flagElement.style.backgroundColor = '#fafafa';
        }, 1000);
    } else {
        // Flag wasn't displayed before, refresh all flags
        displayFlags(client);
    }
}

// Initialize LaunchDarkly client
async function initializeLaunchDarkly(clientSideID) {
    // Check if clientSideID is provided and not empty
    if (!clientSideID || clientSideID.trim() === '') {
        logger.info('No client-side ID provided. Please enter your LaunchDarkly client-side ID in the form above.');
        const flagsContainer = document.getElementById('flags-container');
        flagsContainer.innerHTML = `
            <div style="color: #666; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">
                <strong>No Client-Side ID</strong><br>
                <small>Please enter your LaunchDarkly client-side ID in the form above and click "Load SDK".</small>
            </div>
        `;
        return;
    }

    logger.info('Initializing LaunchDarkly client...');

    // Create plugin instances that will be shared between client and toolbar
    const flagOverridePlugin = createFlagUrlOverridePlugin({
        parameterPrefix: 'ld_override_',
        overrideOptions: {},
        logger: logger
    });

    const eventInterceptionPlugin = new EventInterceptionPlugin();

    // Store reference to client for display updates
    let ldClient = null;

    // Register callback for display updates when overrides change
    flagOverridePlugin.onOverrideChange((flagKey, action) => {
        if (!ldClient) return;

        if (action === 'clear') {
            displayFlags(ldClient, flagOverridePlugin);
        } else if (flagKey) {
            updateFlagDisplay(ldClient, flagKey, flagOverridePlugin);
        }
    });

    const context = {
        kind: 'user',
        key: 'example-user-' + Math.random().toString(36).substring(7),
        name: 'Example User',
        email: 'user@example.com'
    };

    try {
        const client = LDClient.initialize(clientSideID, context, {
            logger: logger,
            evaluationReasons: true,
            plugins: [flagOverridePlugin, eventInterceptionPlugin]
        });

        // Wait for initialization
        await client.waitForInitialization();

        // Store client reference for use in monkey patches
        ldClient = client;

        logger.info('LaunchDarkly client initialized successfully');

        // Display all flags initially
        displayFlags(client, flagOverridePlugin);

        // Listen for flag changes
        client.on('change', (changes) => {
            logger.info(`Flag changes detected: ${Object.keys(changes).join(', ')}`);

            Object.keys(changes).forEach(key => {
                const oldValue = changes[key].previous;
                const newValue = changes[key].current;
                logger.info(`Flag "${key}" changed from ${JSON.stringify(oldValue)} to ${JSON.stringify(newValue)}`);
                updateFlagDisplay(client, key, flagOverridePlugin);
            });
        });

   
        logger.info('Change listeners registered');

            window.LaunchDarklyToolbar.init({
                client: client,
                flagOverridePlugin,
                eventInterceptionPlugin
            });

            logger.info('LaunchDarkly Toolbar initialized');

            // Sync initial overrides to URL (includes any loaded from URL)
            flagOverridePlugin.syncInitialOverrides();

            logger.info('Override URL sync enabled');

    } catch (error) {
        logger.error('Failed to initialize LaunchDarkly client:', error.message);
        const flagsContainer = document.getElementById('flags-container');
        flagsContainer.innerHTML = `
            <div style="color: red; padding: 10px; border: 1px solid red; border-radius: 4px;">
                <strong>Error:</strong> Failed to initialize LaunchDarkly client.<br>
                <small>${error.message}</small><br><br>
                <small>Please check that your client-side ID is correct.</small>
            </div>
        `;
    }
}

// Initialize the application
function initApp() {
    // Get client-side ID from URL
    const clientSideId = getClientSideIdFromUrl();

    // Populate the form input with the current value
    const input = document.getElementById('clientSideId');
    if (input) {
        input.value = clientSideId;
    }

    // Initialize LaunchDarkly if clientSideId is provided
    initializeLaunchDarkly(clientSideId);
}

// Start the application when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
