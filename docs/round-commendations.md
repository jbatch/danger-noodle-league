# Round commendations

Commendations are repeatable, server-authoritative awards resolved when a
Survival round ends. Every tied leader earns the relevant commendation. The
round-results overlay shows that round's awards; lobby and scoreboard surfaces
show cumulative totals.

## Catalogue

| Commendation   | Mark | Award rule                                                                                      |
| -------------- | ---: | ----------------------------------------------------------------------------------------------- |
| Winner         |  `★` | Be the last owner alive.                                                                        |
| Longest Noodle | `〰` | Have the greatest remaining combined tail length when the round ends.                           |
| Peak Noodle    |  `▲` | Reach the greatest combined tail length at any point in the round.                              |
| Maxed Out      |  `◆` | Reach the maximum tail length of 350 trail samples.                                             |
| Egg Lord       |  `●` | Collect the most eggs; no award is made when everyone collected zero.                           |
| Untouchable    |  `◇` | Win without taking damage or losing any head. Shield damage counts as damage.                   |
| Frequent Flyer |  `↑` | Launch the most jumps; no award is made when everyone made zero.                                |
| Power Player   |  `ϟ` | Activate the most power-ups; no award is made when everyone activated zero.                     |
| Survivor       |  `Ⅰ` | Be the last eliminated non-winner. A tied elimination time awards all tied players.             |
| Crash Test     |  `×` | Lose the most heads, including individual Trident heads; no award is made when nobody lost one. |

`Crash Test` is a Survival-round award rather than a Quickplay death counter.
Quickplay has no natural round boundary, while this rule keeps all ten results
comparable and visible together.

## Lifetime

- Anonymous totals last for the player's current room connection and reset on
  disconnect.
- Creating an account or logging in while playing carries the current anonymous
  totals into that account.
- Signed-in totals are written to the account store after every Survival round
  and restored on later visits.
- Totals survive rematches and returning to the lobby.
- Quickplay remains unchanged and does not award round commendations.

Per-round progress is private server state. Snapshots expose only cumulative
counts and the latest resolved award list, preventing clients from claiming
progress while keeping the results UI straightforward.
