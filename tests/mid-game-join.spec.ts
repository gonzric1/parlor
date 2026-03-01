import { test, expect, type Page, type BrowserContext } from '@playwright/test';

test.describe('Mid-game player join', () => {
  test.setTimeout(120000);

  test('Player joining mid-game sees game UI immediately', async ({ browser }) => {
    // --- Setup: TV + 2 players, start game ---
    const tvContext: BrowserContext = await browser.newContext();
    const p1Context: BrowserContext = await browser.newContext();
    const p2Context: BrowserContext = await browser.newContext();

    const tvPage = await tvContext.newPage();
    const p1Page = await p1Context.newPage();
    const p2Page = await p2Context.newPage();

    // TV creates room
    await tvPage.goto('http://localhost:3000/tv');
    await tvPage.click('button:has-text("Create New Game")', { timeout: 5000 });
    const roomCodeEl = await tvPage.waitForSelector('text=/[A-Z]{4}/', { timeout: 10000 });
    const roomCode = (await roomCodeEl.textContent())!.trim();

    // Player 1 joins
    await p1Page.goto('http://localhost:3000/');
    await p1Page.fill('input[placeholder="Room Code"]', roomCode);
    await p1Page.fill('input[placeholder="Your Name"]', 'Alice');
    await p1Page.click('button:has-text("Join Game")');
    await p1Page.waitForURL(`**/play/${roomCode}`, { timeout: 10000 });
    await tvPage.waitForSelector('text=Alice', { timeout: 5000 });

    // Player 2 joins
    await p2Page.goto('http://localhost:3000/');
    await p2Page.fill('input[placeholder="Room Code"]', roomCode);
    await p2Page.fill('input[placeholder="Your Name"]', 'Bob');
    await p2Page.click('button:has-text("Join Game")');
    await p2Page.waitForURL(`**/play/${roomCode}`, { timeout: 10000 });
    await tvPage.waitForSelector('text=Bob', { timeout: 5000 });

    // Start game
    const startBtn = await tvPage.waitForSelector('button:has-text("Start Game"):not([disabled])', { timeout: 5000 });
    await startBtn.click();
    await tvPage.waitForSelector('[data-testid="phase-indicator"]', { timeout: 15000 });

    // --- Mid-game: Player 3 joins ---
    const p3Context: BrowserContext = await browser.newContext();
    const p3Page = await p3Context.newPage();

    await p3Page.goto('http://localhost:3000/');
    await p3Page.fill('input[placeholder="Room Code"]', roomCode);
    await p3Page.fill('input[placeholder="Your Name"]', 'Charlie');
    await p3Page.click('button:has-text("Join Game")');
    await p3Page.waitForURL(`**/play/${roomCode}`, { timeout: 10000 });

    // The fix: Charlie should NOT see "Waiting for game to start..."
    // They should see the game UI (or at minimum "Waiting for your turn")
    // Give a moment for state to arrive
    await p3Page.waitForTimeout(2000);

    const waitingForStart = await p3Page.$('text=Waiting for game to start...');
    expect(waitingForStart).toBeNull();

    // Charlie should see some game content — either waiting for turn or betting controls
    const hasGameUI = await p3Page.evaluate(() => {
      const body = document.body.textContent ?? '';
      return body.includes('Waiting for your turn') ||
             body.includes('Fold') ||
             body.includes('Check') ||
             body.includes('Call') ||
             body.includes('Waiting for next hand');
    });
    expect(hasGameUI).toBe(true);

    // --- Play through the current hand to showdown so a new round starts ---
    // Advance by having active players check/call until showdown
    for (let i = 0; i < 20; i++) {
      const phase = await tvPage.locator('[data-testid="phase-indicator"]').textContent();
      if ((phase ?? '').toLowerCase().includes('showdown')) break;

      try {
        // Find who has the Fold button
        const active = await Promise.race([
          p1Page.waitForSelector('button:has-text("Fold")', { timeout: 2000 }).then(() => p1Page),
          p2Page.waitForSelector('button:has-text("Fold")', { timeout: 2000 }).then(() => p2Page),
        ]);
        const checkBtn = await active.$('button:has-text("Check")');
        if (checkBtn) {
          await checkBtn.click();
        } else {
          const callBtn = await active.$('button:has-text("Call")');
          if (callBtn) await callBtn.click();
        }
        await tvPage.waitForTimeout(500);
      } catch {
        await tvPage.waitForTimeout(500);
      }
    }

    // Wait for showdown to finish and next round to begin
    await tvPage.waitForTimeout(8000);

    // After next round starts, Charlie should be able to play (might have Fold button)
    // At minimum, Charlie should be in the game with game UI visible
    const p3HasGameContent = await p3Page.evaluate(() => {
      const body = document.body.textContent ?? '';
      return body.includes('Waiting for your turn') ||
             body.includes('Fold') ||
             body.includes('Check') ||
             body.includes('Call');
    });
    expect(p3HasGameContent).toBe(true);

    // Verify TV shows Charlie
    await tvPage.waitForSelector('text=Charlie', { timeout: 5000 });

    // Cleanup
    await tvContext.close();
    await p1Context.close();
    await p2Context.close();
    await p3Context.close();
  });
});
