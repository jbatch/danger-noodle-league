# One-off achievements

Achievements are permanent, server-authoritative milestones. Unlike repeatable
round commendations, each achievement unlocks only once per player account.
Anonymous players can unlock them during the current room session; creating an
account or logging in carries those pending unlocks into the saved account.

## Starter catalogue

| Achievement     | Mark | Unlock rule                                                                 |
| --------------- | ---: | --------------------------------------------------------------------------- |
| First Bite      |  `Ⅰ` | Win a first Survival round.                                                 |
| League Champion |  `★` | Win a complete Survival match.                                              |
| Full House      |  `8` | Win a Survival round that started with eight players.                       |
| Clean Sweep     |  `◇` | Win without taking damage or losing a head. Shield damage counts as damage. |
| Fully Grown     |  `◆` | Reach the maximum tail length during one round.                             |
| Egg Carton      |  `●` | Collect 12 eggs during one Survival round.                                  |
| Power Tour      |  `ϟ` | Activate all seven core power-ups during one round.                         |
| Air Time        |  `↑` | Launch 20 jumps during one Survival round.                                  |
| Hard Headed     |  `×` | Lose three heads during one Survival round, normally by using Trident.      |

## Behaviour

- Achievement checks run when a Survival round ends. Quickplay does not unlock
  this starter set.
- The round-results overlay announces newly unlocked achievements.
- The account panel shows the full catalogue, including locked requirements and
  the current unlocked count.
- Signed-in unlocks are written to the account store once and restored in later
  sessions.
- Account store versions 1 and 2 migrate automatically with an empty achievement
  list.

Achievement IDs live in the shared catalogue. Adding a new achievement requires
its catalogue entry, an authoritative server condition, and focused test
coverage; clients never submit unlock claims.
