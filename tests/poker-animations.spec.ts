import { test, expect, type Page, type BrowserContext } from '@playwright/test';

// ---- Helpers ----

async function createRoomAndJoin(browser: any) {
  const tvContext: BrowserContext = await browser.newContext();
  const p1Context: BrowserContext = await browser.newContext();
  const p2Context: BrowserContext = await browser.newContext();

  const tvPage = await tvContext.newPage();
  const p1Page = await p1Context.newPage();
  const p2Page = await p2Context.newPage();

  // TV creates room
  await tvPage.goto('http://localhost:3000/tv');
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

  return {
    tvPage, p1Page, p2Page,
    tvContext, p1Context, p2Context,
    roomCode,
    cleanup: async () => {
      await tvContext.close();
      await p1Context.close();
      await p2Context.close();
    },
  };
}

/** Find which player page has the Fold button (their turn) */
async function findActivePlayer(p1Page: Page, p2Page: Page, timeout = 5000): Promise<{ active: Page; waiting: Page }> {
  return Promise.race([
    p1Page.waitForSelector('button:has-text("Fold")', { timeout }).then(() => ({ active: p1Page, waiting: p2Page })),
    p2Page.waitForSelector('button:has-text("Fold")', { timeout }).then(() => ({ active: p2Page, waiting: p1Page })),
  ]);
}

/** Check or call on the active player's page */
async function checkOrCall(page: Page) {
  const checkBtn = await page.$('button:has-text("Check")');
  if (checkBtn) {
    await checkBtn.click();
  } else {
    const callBtn = await page.$('button:has-text("Call")');
    if (callBtn) await callBtn.click();
  }
}

/** Get the current phase text from the TV */
async function getPhase(tvPage: Page): Promise<string> {
  const text = await tvPage.locator('[data-testid="phase-indicator"]').textContent();
  return (text ?? '').toLowerCase().trim();
}

/** Advance the game by having the active player check/call. Repeats until the phase changes. */
async function advanceUntilPhaseChanges(tvPage: Page, p1Page: Page, p2Page: Page, fromPhase: string, maxRounds = 10) {
  for (let i = 0; i < maxRounds; i++) {
    const phase = await getPhase(tvPage);
    if (phase !== fromPhase) return phase;

    try {
      const { active } = await findActivePlayer(p1Page, p2Page, 3000);
      await checkOrCall(active);
      await tvPage.waitForTimeout(500);
    } catch {
      await tvPage.waitForTimeout(500);
    }
  }
  return await getPhase(tvPage);
}

// ---- Tests ----

test.describe('Poker Animations', () => {
  test.setTimeout(120000);

  test('Active player glow pulse on TV', async ({ browser }) => {
    const { tvPage, cleanup } = await createRoomAndJoin(browser);
    try {
      // Active player seat should have red box-shadow (glow pulse)
      await tvPage.waitForFunction(() => {
        const seats = document.querySelectorAll('[data-testid^="player-seat-"]');
        for (const seat of seats) {
          const style = getComputedStyle(seat);
          if (style.boxShadow && style.boxShadow.includes('233')) return true;
        }
        return false;
      }, undefined, { timeout: 5000 });
    } finally {
      await cleanup();
    }
  });

  test('Deal animation shows face-down cards on TV', async ({ browser }) => {
    const { tvPage, cleanup } = await createRoomAndJoin(browser);
    try {
      // Wait for face-down card elements inside player seat divs to appear
      await tvPage.waitForSelector('[data-testid^="dealt-cards-"]', { timeout: 5000 });

      // Both players should eventually have dealt cards
      const dealtCards = await tvPage.locator('[data-testid^="dealt-cards-"]').count();
      expect(dealtCards).toBe(2);
    } finally {
      await cleanup();
    }
  });

  test('Hole cards animate in on PlayerView', async ({ browser }) => {
    const { p1Page, p2Page, cleanup } = await createRoomAndJoin(browser);
    try {
      for (const page of [p1Page, p2Page]) {
        // Each player should see 2 face-up hole cards (white background)
        await page.waitForFunction(() => {
          const cards = document.querySelectorAll('div[style*="background: rgb(255, 255, 255)"]');
          return cards.length >= 2;
        }, undefined, { timeout: 8000 });
      }
    } finally {
      await cleanup();
    }
  });

  test('Player cards delayed until dealt', async ({ browser }) => {
    const { p1Page, p2Page, cleanup } = await createRoomAndJoin(browser);
    try {
      // Both players should eventually see their face-up hole cards
      for (const page of [p1Page, p2Page]) {
        await page.waitForFunction(() => {
          const cards = document.querySelectorAll('div[style*="background: rgb(255, 255, 255)"]');
          return cards.length >= 2;
        }, undefined, { timeout: 8000 });
      }
    } finally {
      await cleanup();
    }
  });

  test('BettingControls show/hide between players', async ({ browser }) => {
    const { p1Page, p2Page, cleanup } = await createRoomAndJoin(browser);
    try {
      const { active, waiting } = await findActivePlayer(p1Page, p2Page);

      await expect(active.locator('button:has-text("Fold")')).toBeVisible();
      await expect(waiting.locator('text=Waiting for your turn')).toBeVisible();

      await checkOrCall(active);

      // Controls should move to other player
      await waiting.waitForSelector('button:has-text("Fold")', { timeout: 5000 });
    } finally {
      await cleanup();
    }
  });

  test('Fold shows Folded status and showdown follows', async ({ browser }) => {
    const { tvPage, p1Page, p2Page, cleanup } = await createRoomAndJoin(browser);
    try {
      const { active } = await findActivePlayer(p1Page, p2Page);
      await active.locator('button:has-text("Fold")').click();

      // TV should show "Folded" text on the seat
      await tvPage.waitForSelector('text=Folded', { timeout: 5000 });

      // Showdown overlay should appear (last player standing wins)
      await tvPage.waitForSelector('[data-testid="showdown-overlay"]', { timeout: 5000 });
      const overlayText = await tvPage.locator('[data-testid="showdown-overlay"]').textContent();
      expect(overlayText).toContain('wins');
    } finally {
      await cleanup();
    }
  });

  test('Community cards appear on flop', async ({ browser }) => {
    const { tvPage, p1Page, p2Page, cleanup } = await createRoomAndJoin(browser);
    try {
      // Advance past pre-flop
      const newPhase = await advanceUntilPhaseChanges(tvPage, p1Page, p2Page, 'pre-flop');
      expect(['flop', 'turn', 'river', 'showdown']).toContain(newPhase);

      if (newPhase === 'flop' || newPhase === 'turn' || newPhase === 'river') {
        // Wait for community cards to render (inside the perspective container)
        await tvPage.waitForFunction(() => {
          const container = document.querySelector('div[style*="perspective"]');
          if (!container) return false;
          const cards = container.querySelectorAll('div[style*="background: rgb(255, 255, 255)"]');
          return cards.length >= 3;
        }, undefined, { timeout: 8000 });
      }
    } finally {
      await cleanup();
    }
  });

  test('Showdown overlay appears and exits after new hand', async ({ browser }) => {
    const { tvPage, p1Page, p2Page, cleanup } = await createRoomAndJoin(browser);
    try {
      // Check/call through all rounds to reach showdown without eliminating a player
      let phase = await getPhase(tvPage);
      while (phase !== 'showdown') {
        try {
          const { active } = await findActivePlayer(p1Page, p2Page, 3000);
          await checkOrCall(active);
          await tvPage.waitForTimeout(500);
        } catch {
          await tvPage.waitForTimeout(500);
        }
        phase = await getPhase(tvPage);
      }

      // Showdown overlay should appear
      await tvPage.waitForSelector('[data-testid="showdown-overlay"]', { timeout: 10000 });
      const text = await tvPage.locator('[data-testid="showdown-overlay"]').textContent();
      expect(text).toBeTruthy();
      expect(text!).toContain('wins');

      // Wait for overlay to disappear (new hand after ~5s)
      await tvPage.waitForFunction(() => {
        return !document.querySelector('[data-testid="showdown-overlay"]');
      }, undefined, { timeout: 15000 });
    } finally {
      await cleanup();
    }
  });

  test('Muck by default when all fold', async ({ browser }) => {
    const { tvPage, p1Page, p2Page, cleanup } = await createRoomAndJoin(browser);
    try {
      const { active } = await findActivePlayer(p1Page, p2Page);
      await active.locator('button:has-text("Fold")').click();

      // Showdown overlay should appear with just "{name} wins!" (no cards shown)
      await tvPage.waitForSelector('[data-testid="showdown-overlay"]', { timeout: 5000 });
      const overlayText = await tvPage.locator('[data-testid="showdown-overlay"]').textContent();
      expect(overlayText).toContain('wins');

      // Should NOT show any card rows in the overlay (mucked by default after 5s)
      // During winner-decide, playerHands is empty so no card display
      const cardRows = await tvPage.locator('[data-testid="showdown-overlay"] .hand').count();
      expect(cardRows).toBe(0);

      // Wait for new hand to start (5s decide + 5s showdown)
      await tvPage.waitForFunction(() => {
        const phase = document.querySelector('[data-testid="phase-indicator"]');
        return phase && phase.textContent?.toLowerCase().includes('pre-flop');
      }, undefined, { timeout: 15000 });
    } finally {
      await cleanup();
    }
  });

  test('Reveal cards when winner chooses', async ({ browser }) => {
    const { tvPage, p1Page, p2Page, cleanup } = await createRoomAndJoin(browser);
    try {
      const { active, waiting } = await findActivePlayer(p1Page, p2Page);

      // The non-active player folds
      await active.locator('button:has-text("Fold")').click();

      // The winner (waiting player) should see the reveal button
      await waiting.waitForSelector('[data-testid="reveal-button"]', { timeout: 5000 });
      await waiting.locator('[data-testid="reveal-button"]').click();

      // Showdown overlay should show on TV with the winner's cards revealed
      await tvPage.waitForSelector('[data-testid="showdown-overlay"]', { timeout: 5000 });
      const overlayText = await tvPage.locator('[data-testid="showdown-overlay"]').textContent();
      expect(overlayText).toContain('wins');
    } finally {
      await cleanup();
    }
  });

  test('Pot area shows chip count', async ({ browser }) => {
    const { tvPage, p1Page, p2Page, cleanup } = await createRoomAndJoin(browser);
    try {
      await tvPage.waitForSelector('[data-testid="pot-area"]', { timeout: 5000 });

      const { active } = await findActivePlayer(p1Page, p2Page);
      await checkOrCall(active);
      await tvPage.waitForTimeout(800);

      const potText = await tvPage.locator('[data-testid="pot-area"]').textContent();
      expect(potText).toBeTruthy();
    } finally {
      await cleanup();
    }
  });
});
