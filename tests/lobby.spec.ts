import { test, expect, type Page, type BrowserContext } from '@playwright/test';

test.describe('Lobby flow', () => {
  let tvPage: Page;
  let player1Page: Page;
  let player2Page: Page;
  let roomCode: string;

  test('TV creates room, players join, game starts', async ({ browser }) => {
    // Create 3 separate browser contexts (like separate browsers)
    const tvContext = await browser.newContext();
    const p1Context = await browser.newContext();
    const p2Context = await browser.newContext();

    tvPage = await tvContext.newPage();
    player1Page = await p1Context.newPage();
    player2Page = await p2Context.newPage();

    // Enable console logging for debugging
    tvPage.on('console', msg => console.log(`[TV] ${msg.text()}`));
    player1Page.on('console', msg => console.log(`[P1] ${msg.text()}`));
    player2Page.on('console', msg => console.log(`[P2] ${msg.text()}`));

    // 1. TV navigates to /tv and creates a room
    await tvPage.goto('http://localhost:3000/tv');
    console.log('TV page loaded');

    // Wait for room code to appear (large text with 4 uppercase letters)
    const roomCodeEl = await tvPage.waitForSelector('text=/[A-Z]{4}/', { timeout: 5000 });
    roomCode = (await roomCodeEl.textContent())!.trim();
    console.log(`Room code: ${roomCode}`);
    expect(roomCode).toMatch(/^[A-Z]{4}$/);

    // Check what the TV lobby shows
    const tvContent = await tvPage.content();
    console.log('TV page title/headers visible');

    // 2. Player 1 joins
    await player1Page.goto('http://localhost:3000/');
    await player1Page.fill('input[placeholder="Room Code"]', roomCode);
    await player1Page.fill('input[placeholder="Your Name"]', 'Alice');
    await player1Page.click('button:has-text("Join Game")');

    // Should navigate to /play/:roomCode
    await player1Page.waitForURL(`**/play/${roomCode}`, { timeout: 5000 });
    console.log('Player 1 (Alice) joined successfully');

    // Wait for TV to show the player
    await tvPage.waitForSelector('text=Alice', { timeout: 3000 });
    console.log('TV shows Alice');

    // 3. Player 2 joins
    await player2Page.goto('http://localhost:3000/');
    await player2Page.fill('input[placeholder="Room Code"]', roomCode);
    await player2Page.fill('input[placeholder="Your Name"]', 'Bob');
    await player2Page.click('button:has-text("Join Game")');

    await player2Page.waitForURL(`**/play/${roomCode}`, { timeout: 5000 });
    console.log('Player 2 (Bob) joined successfully');

    await tvPage.waitForSelector('text=Bob', { timeout: 3000 });
    console.log('TV shows Bob');

    // 4. Check the state of the lobby on TV
    // Take a screenshot for debugging
    await tvPage.screenshot({ path: '/tmp/parlor-tv-lobby.png' });
    console.log('Screenshot saved to /tmp/parlor-tv-lobby.png');

    // Log all buttons and their states
    const buttons = await tvPage.$$('button');
    for (const btn of buttons) {
      const text = await btn.textContent();
      const disabled = await btn.isDisabled();
      console.log(`Button: "${text?.trim()}" disabled=${disabled}`);
    }

    // 5. Try to select poker game
    const pokerBtn = await tvPage.$('button:has-text("Hold")');
    if (pokerBtn) {
      console.log('Found poker button, clicking...');
      await pokerBtn.click();
      await tvPage.waitForTimeout(500);
    } else {
      console.log('No poker button found!');
    }

    // Check lobby state after selection
    await tvPage.screenshot({ path: '/tmp/parlor-tv-after-select.png' });
    const buttonsAfter = await tvPage.$$('button');
    for (const btn of buttonsAfter) {
      const text = await btn.textContent();
      const disabled = await btn.isDisabled();
      console.log(`After select - Button: "${text?.trim()}" disabled=${disabled}`);
    }

    // 6. Try to start game
    const startBtn = await tvPage.$('button:has-text("Start Game")');
    if (startBtn) {
      const isDisabled = await startBtn.isDisabled();
      console.log(`Start Game button disabled=${isDisabled}`);
      if (!isDisabled) {
        await startBtn.click();
        console.log('Game started!');
      } else {
        console.log('START GAME IS DISABLED - this is the bug!');
        // Debug: check lobby state via page evaluate
        const lobbyDebug = await tvPage.evaluate(() => {
          return (window as any).__debugLobby;
        });
        console.log('Debug lobby state:', JSON.stringify(lobbyDebug));
      }
    }

    // Cleanup
    await tvContext.close();
    await p1Context.close();
    await p2Context.close();
  });
});
