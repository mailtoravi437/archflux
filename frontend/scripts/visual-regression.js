// Visual regression baseline — ArchFlux Design System v2.0.0
// Run: npm run test -- visual-regression (or manual screenshot comparison)
// Covers: light/dark themes on Dashboard, Canvas, Settings, Library
const screens = ['DashboardScreen', 'CanvasScreen', 'SettingsGeneralScreen', 'LibraryScreen', 'LoginScreen'];
console.log('Visual regression targets:', screens);
console.log('Compare against reference images in test-results/');
console.log('Pass criteria: theme tokens consistent, focus rings visible, no hardcoded hex outside user palette');
