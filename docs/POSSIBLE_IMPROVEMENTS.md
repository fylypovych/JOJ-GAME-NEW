# Possible Improvements

This file stores deferred feature ideas that were explicitly postponed.
Do not surface them proactively unless requested.

## Deferred Items

### 5. Replay / Timeline System
- Save and browse a structured turn-by-turn replay.
- Show draw / play / target / promotion events as a navigable timeline.
- Keep it separate from live chat and system log.

### 6. Achievement Progression UI
- Add progress bars toward the next award.
- Group awards by category and rarity.
- Show newly unlocked badges after a match ends.

### 8. Draft / Setup Presets
- Add quick presets for room creation such as:
  - classic
  - with VVNZ
  - fast match
  - chaos
  - tournament

### 11. MMR / Ranked Rating
- Add ranked matches and rating changes.
- Support seasonal ladders and leaderboard views.
- Keep casual and ranked flows separate.

### 12. Tournament Mode
- Support bracket-based play.
- Add best-of series and tournament admin tools.
- Export tournament results.

### 13. Daily / Weekly Challenges
- Add rotating tasks tied to gameplay and progression.
- Examples:
  - win 3 matches
  - play 5 VVNZ cards
  - reach captain

### 14. Card Collection in Profile
- Add a profile-level card compendium / collection view.
- Track seen / played / favorite card categories.
- Keep it informational, not gameplay inventory.

## Deferred From Later Feature Review

### 1. Room Invites and Private Rooms
- Add private matches and invite codes.
- Support copying a direct room link.
- Keep public and private room flows separate.

### 2. Public Profile Page
- Add a dedicated public profile route.
- Respect privacy flags for stats and recent matches.
- Keep it separate from the private profile editor.

### 3. Expanded Post-Match Recap
- Add key-card highlights and momentum swing summaries.
- Show who attacked whom most often.
- Surface a clearer “turning point” recap.

### 6. Match History Filters
- Add filtering by game mode, bots, result, and date.
- Support sorting by date, duration, and outcome.

### 7. Deeper User Roles
- Add more granular roles such as moderator.
- Support permission-scoped admin access.
- Add an audit trail for admin actions.

### 8. Spectator Mode Expansion
- Add a dedicated spectator-only layout.
- Improve live/timeline/summary navigation.
- Add stronger active-player focus for spectators.

## Deferred From Game Design Review

### 1. Round Events / Global Match Modifiers
- Add temporary round-wide events such as inspection, reform, overload, or media wave.
- Let them modify card value or play rules for 1 round without changing core win conditions.
- Use them to make matches less linear and create more tempo swings.

### 2. Short-Term Player Status Effects
- Add temporary statuses like under supervision, inspiration, bureaucracy jam, media boost, or reserve.
- Keep them at 1-2 turns so they stay readable.
- Use them as a new interaction layer beyond raw resource gain/loss.

### 3. Starting Doctrines / Player Archetypes
- Let each player choose a light passive identity before the match.
- Examples: careerist, tactician, bureaucrat, media operator.
- Keep them small enough to shape playstyle without becoming faction-level asymmetry.

### 4. Public Secondary Objectives
- Add 1-2 open match goals alongside rank victory.
- Examples:
  - be first to reach 5 discipline
  - survive 3 scandals
  - play 2 command cards
- Use them to diversify incentives and reduce single-track rank racing.

### 5. In-Match Titles / Recap Honors
- Award lightweight end-of-match titles such as loudest scandal, iron discipline, or VVNZ master.
- Reuse match statistics already tracked by the game where possible.
- Show them in the post-match recap to make losses feel more informative.

### 6. Themed Card Synergy Packages
- Design mini card packages with internal synergy instead of only standalone strong cards.
- Good package themes:
  - media
  - headquarters
  - education
  - volunteer/logistics
  - bureaucracy
- Use them in modules and presets to create clearer deck identities.

### 7. Modal Cards
- Add cards with two legal play modes, such as immediate effect vs delayed setup.
- Keep the modes explicit in UI and logs.
- Use them to increase decision depth without massively increasing card count.

### 8. Risk / Commitment Cards
- Add high-impact cards that require the player to satisfy a condition by end of round or suffer a penalty.
- Use them for dramatic swings and stronger bluff/tempo decisions.
- Keep the penalty legible and system-tracked.

### 9. Card Tags and Combo Hooks
- Add lightweight tags such as media, education, command, logistics, morale.
- Let some cards scale or unlock bonus text when paired with matching tags.
- This creates combo depth without replacing the current category system.

### 10. Rank-Specific Passive Abilities
- Give each rank a small passive or once-per-turn rule.
- Keep them simple so rank progression remains readable.
- Use them to make advancement feel like a rules change, not only a stat change.

### 11. Catch-Up Mechanics
- Add soft comeback systems for players who fall too far behind on rank or resources.
- Prefer conditional bonuses over flat compensation.
- This helps long matches stay competitive without removing punishment for bad play.

### 12. Match Balance Dashboard
- Extend the simulation/balance workflow with per-card, per-module, and per-seat balance summaries.
- Track win rate, play rate, and swing potential for cards and modules.
- Use it as the balancing companion to future content expansion.

## Deferred From Architecture-Aware Gameplay Review

### 1. Reaction Cards / Interrupt Window
- Add a narrow response window for selected cards or effects.
- Allow players to cancel, weaken, redirect, or mirror an incoming effect.
- Build it on top of existing pending-resolution and rollback patterns.

### 2. Scheduled Effects
- Add delayed card effects that trigger at the start or end of a later turn.
- Store them as structured scheduled actions in game state instead of one-off flags.
- Use them to add planning and threat management without changing base resources.

### 3. Secret Personal Missions
- Give each player a hidden match objective in addition to the normal win path.
- Reveal them only at match end or when completed.
- Use them to add bluff and alternate incentives with low rules overhead.

### 4. Player Attachments / Persistent Cards
- Add card effects that remain attached to a player instead of resolving instantly.
- Examples: ongoing protection, passive bonuses, recurring penalties.
- Represent them as a persistent per-player board zone rather than chat-only memory.

### 5. Conditional Legendary Scaling
- Let some legendary cards gain stronger text when the board state matches a condition.
- Example triggers:
  - current rank threshold
  - resource threshold
  - repeated scandals this match
- Centralize this in the legendary ability registry instead of ad-hoc handlers.

### 6. Transforming Cards
- Let some cards convert into a weaker or different follow-up card after play.
- Use this to create narrative arcs without bloating the starting deck.
- Keep transformation explicit in discard/log output.

### 7. Multi-Step Cards
- Add cards with a prepare-and-resolve flow or A/B branch selection.
- Reuse the existing selection and pending-resolution model for implementation.
- Use them for more expressive tactical turns without introducing full subgames.

### 8. History-Aware Effects
- Add effects that read the match history, discard flow, or prior applied attacks.
- Examples:
  - bonus if you were hit by two scandals this match
  - stronger effect if three LYAP cards were already played
  - recovery based on last canceled attack
- Use the existing applied effect log as the backbone.

### 9. Hand Limit Interaction
- Add cards, statuses, or rank perks that temporarily raise or cut hand size.
- Use this as a tempo and denial mechanic instead of only resource pressure.
- Keep the cap visible in UI so it remains readable.

### 10. Resource Locking
- Add temporary locks on spending or gaining a specific resource type.
- Example: cannot spend documents this turn, cannot gain reputation until next turn.
- This creates a new control layer without inventing more resources.

### 11. Seat-Limit Manipulation
- Add effects that temporarily open, reserve, or block rank seats.
- This would make the existing seat-limit system a more active gameplay lever.
- Use it sparingly for high-impact tactical turns.

### 12. Alternative Payment Modes
- Let selected cards be paid with either normal cost or an alternate sacrifice.
- Examples: discard a card, lose rank tempo, or overspend another resource.
- This fits naturally with the current replacement/cost-resolution model.

### 13. Recovery-From-Failure Cards
- Add cards that get cheaper or stronger after failed promotion, demotion, or repeated pressure.
- Use them as a soft anti-snowball tool tied to concrete events, not generic pity bonuses.
- Keep triggers explicit in rules text and validation hints.

### 14. Predictive Action Preview
- Expand pre-play UI hints to show expected state diff before confirming a move.
- Surface likely resource changes, rank movement, and affected targets.
- Build it from the same shared validation and effect-summary layer already used by runtime.

### 15. Structured Invalid-Move Explanations
- Replace generic rejection feedback with structured reason categories.
- Example outputs:
  - no valid target
  - rank seat full
  - missing replacement resources
  - blocked by protection
- This improves learnability and makes future mechanics easier to debug.

### 16. Causal Post-Match Breakdown
- Add a match-end summary that identifies the biggest swings and most decisive cards.
- Build it from applied effect log plus existing game stats.
- Use it as both a player-facing recap and a balancing aid.
