import { test } from '@playwright/test';

test.describe('Debug Canvas Load', () => {
  test('should load canvas page and log console errors', async ({ page }) => {
    // Set up a guest session before navigating
    await page.addInitScript(() => {
      localStorage.setItem('archflux:session', JSON.stringify({ mode: 'guest' }));
      localStorage.setItem('archflux:onboarded', 'true');
    });

    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    page.on('pageerror', error => {
      errors.push(error.message);
    });

    // Use hash routing
    await page.goto('/#/canvas');
    await page.waitForTimeout(5000); // Wait for React to hydrate

    console.log('Console errors:', errors);
    
    // Check if root has children
    const rootChildren = await page.locator('#root').evaluate(el => el.innerHTML);
    console.log('Root innerHTML length:', rootChildren.length);
    console.log('Root innerHTML preview:', rootChildren.substring(0, 500));

    // Check if canvas exists
    const canvas = await page.locator('#architectureCanvas').count();
    console.log('Canvas count:', canvas);
  });
});