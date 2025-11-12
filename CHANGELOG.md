# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial release of LaunchDarkly Dev Toolbar with URL-Shareable Overrides
- URL-based flag override system with automatic synchronization
- Real-time flag visualization and management
- Custom logger implementation with color-coded log levels
- Flag URL Override Plugin for reusable override management
- Integration with LaunchDarkly Developer Toolbar
- Event interception capabilities for debugging
- Auto-scrolling log viewer with timestamps
- Support for sharing flag configurations via URL parameters
- GitHub Actions workflow for automated deployment to GitHub Pages

### Features
- Real-time display of all feature flags with values and evaluation reasons
- Visual indicators for flags with active overrides
- Interactive developer toolbar for local flag overrides
- Override persistence across page reloads via URL parameters
- Support for boolean, number, string, and JSON object flag values
- Automatic URL updates without page reload using `history.replaceState`

