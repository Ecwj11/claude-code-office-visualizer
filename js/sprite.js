/*
 * sprite.js
 * Pure sheet-row selection for theme-declared frame animation (Task 18). Given
 * an agent's behavioural state and facing, this decides which row of a sprite
 * sheet to show — nothing else. No DOM, no timers, no image loading (Agent
 * owns all of that). Kept out of agent.js, and out of any DOM method, on
 * purpose so it stays a plain, directly unit-testable function — see
 * tests/sprite.test.js.
 *
 * The sheet has no dedicated up/down run cycle, so WALKING while facing up or
 * down reuses whichever horizontal direction ('left'/'right') the agent last
 * actually ran in. That's the agreed compromise, matching how the emoji
 * sprites already reuse one image for all vertical movement.
 */
(function (OV) {
  'use strict';

  const STATES = OV.STATES;

  // status: one of OV.STATES. facing: 'up' | 'down' | 'left' | 'right'.
  // lastHorizontalFacing: 'left' | 'right' | null (null = never moved
  // horizontally yet). Returns a sheet row key: 'runRight' | 'runLeft' |
  // 'idle' | 'work' — callers map that through the theme's own
  // `sprites.rows`/`sprites.counts` to get an actual row index/frame count.
  function rowForState(status, facing, lastHorizontalFacing) {
    if (status === STATES.WORKING) return 'work';

    if (status === STATES.WALKING) {
      if (facing === 'left') return 'runLeft';
      if (facing === 'right') return 'runRight';
      // facing is 'up' or 'down' — there's no vertical art for it.
      return lastHorizontalFacing === 'left' ? 'runLeft' : 'runRight';
    }

    // IDLE, WAITING, THINKING, COLLABORATING, ERROR, COMPLETED (and any
    // future state) all read as standing still.
    return 'idle';
  }

  OV.Sprite = {
    rowForState: rowForState,
  };
})(window.OV = window.OV || {});
