

# Umfassende Analyse aller Informationen am Pokertisch

## Zweck: Entscheidungsgrundlage fuer eine 6-Max Texas Hold'em Training App

---

## 1. BOARD TEXTURE INFORMATION (Gemeinschaftskarten-Analyse)

### 1.1 Board-Typen nach Paarung

**Unpaired Board (keine Paare)**
- **Was es ist:** Alle Gemeinschaftskarten haben unterschiedliche Raenge (z.B. K-9-4, Q-T-7).
- **Wie extrahieren:** Pruefen ob irgendein Rang doppelt vorkommt.
- **Einfluss auf Entscheidung:** Sets sind moeglich aber unwahrscheinlich (Gegner hat nur ~12% Chance auf ein spezifisches Pocket Pair). Top Pair ist oft die beste Hand. Draws sind haeufiger die Hauptbedrohung.
- **Wann am wichtigsten:** Immer am Flop als erste Einschaetzung.

**Paired Board (ein Paar auf dem Board)**
- **Was es ist:** Zwei Karten gleichen Rangs auf dem Board (z.B. K-K-7, 9-9-3).
- **Wie extrahieren:** Rang-Duplikat erkennen.
- **Einfluss auf Entscheidung:** Trips/Full Houses werden moeglich. Die Anzahl moeglicher Kombinationen fuer Top Pair sinkt drastisch (nur noch 3 statt 9 Combos fuer z.B. Kx auf K-K-7). Bluffs werden profitabler, weil der Gegner seltener starke Haende hat. Wer die gepaarte Karte haelt, hat Trips — aber es gibt nur 2 verbleibende Combos.
- **Wann am wichtigsten:** Besonders auf hoch-gepaarten Boards (A-A-x, K-K-x), da diese die Ranges stark polarisieren.

**Double-Paired Board (zwei Paare auf dem Board)**
- **Was es ist:** Zwei verschiedene Paare auf dem Board (z.B. K-K-9-9-x nach Turn oder River).
- **Wie extrahieren:** Zwei Rang-Duplikate erkennen.
- **Einfluss auf Entscheidung:** Full Houses dominieren. Flushes und Straights verlieren massiv an Wert. Ein einzelnes Trips ist sehr verwundbar. Der River wird extrem polarisiert — entweder Full House/Quads oder fast nichts.
- **Wann am wichtigsten:** Am River bei Pot-Entscheidungen. Haeufig Overfolding gegen Bets korrekt, da Bluffs selten sind.

**Trips Board (Drilling auf dem Board)**
- **Was es ist:** Drei Karten gleichen Rangs (z.B. 7-7-7-K-x).
- **Wie extrahieren:** Drei gleiche Raenge erkennen.
- **Einfluss auf Entscheidung:** Quads sind fast unmoeglich (nur 1 Combo). Wer ein Pocket Pair haelt, hat ein Full House. Wer die vierte Karte haelt, hat Quads. Kicker-Staerke entscheidet bei Trips vs Trips. Sehr bluff-freundlich, da kaum jemand eine starke Hand hat.
- **Wann am wichtigsten:** Seltener Spezialfall, aber wichtig fuer korrekte Bluff-Frequenzen.

### 1.2 Board-Typen nach Farbe (Suits)

**Monotone Board (alle gleiche Farbe)**
- **Was es ist:** Alle drei Flopkarten (oder vier/fuenf spaeter) haben die gleiche Farbe (z.B. Ah-Kh-7h).
- **Wie extrahieren:** Suit-Zaehlung: max(suit_count) >= 3.
- **Einfluss auf Entscheidung:** Jeder mit zwei Karten der passenden Farbe hat bereits einen Flush. Jeder mit einer Karte der passenden Farbe hat einen Flush Draw. Made Hands ohne Flush-Karte verlieren massiv an Wert. Die Nut-Flush-Blocker (Ace der Farbe) werden extrem wertvoll — sowohl als Bluff-Blocker als auch als Bluff-Kandidat. C-Bet-Frequenz sinkt drastisch fuer den Preflop-Aggressor.
- **Wann am wichtigsten:** Am Flop fuer C-Bet-Entscheidung, am Turn/River fuer Bluff-Konstruktion.

**Two-Tone Board (zwei Karten gleicher Farbe)**
- **Was es ist:** Zwei der drei Flopkarten teilen sich eine Farbe (z.B. Ah-Kh-7c).
- **Wie extrahieren:** Genau ein Suit kommt 2x vor.
- **Einfluss auf Entscheidung:** Flush Draws sind moeglich aber nicht dominant. Backdoor Flush Draws erhoehen die Equity leicht. Normal hohe C-Bet-Frequenzen moeglich. Die dritte Karte der passenden Farbe am Turn aendert die Dynamik komplett.
- **Wann am wichtigsten:** Standard-Situation, Turn-Karte wird kritisch wenn sie den Flush komplettiert.

**Rainbow Board (alle verschiedene Farben)**
- **Was es ist:** Alle drei Flopkarten haben unterschiedliche Farben (z.B. Ah-Kd-7c).
- **Wie extrahieren:** Alle drei Suits verschieden.
- **Einfluss auf Entscheidung:** Kein Flush Draw moeglich (nur Backdoor). Made Hands behalten ihren Wert besser. Board ist "trockener". Hohe C-Bet-Frequenzen sind profitabel. Slow-Playing wird attraktiver, da weniger Gefahr besteht, dass der Gegner kostenlos Equity realisiert.
- **Wann am wichtigsten:** Am Flop fuer aggressive Strategien. Ideal fuer Value-Extraction mit starken Made Hands.

### 1.3 Board-Konnektivitaet

**Connected Board (verbundene Karten)**
- **Was es ist:** Karten liegen nah beieinander im Rang (z.B. 8-9-T, J-T-9, 7-8-9).
- **Wie extrahieren:** Differenz zwischen aufeinanderfolgenden Raengen berechnen. Wenn max_gap <= 2 und mindestens zwei Karten innerhalb von 3 Raengen liegen = connected.
- **Einfluss auf Entscheidung:** Viele Straight-Moeglichkeiten (made Straights + Draws). Ranges, die Middle Cards spielen (suited connectors, mittlere Pocket Pairs), profitieren enorm. Der Caller hat oft einen Range-Vorteil gegenueber dem Raiser auf diesen Boards. Multi-Way-Pots werden extrem gefaehrlich.
- **Wann am wichtigsten:** Entscheidend fuer Range-Advantage-Bestimmung. Auf J-T-9 hat der Big Blind eine enorme Anzahl an Two-Pair-, Set-, und Straight-Combos.

**Disconnected/Dry Board (unverbundene Karten)**
- **Was es ist:** Karten liegen weit auseinander (z.B. K-7-2, A-8-3).
- **Wie extrahieren:** Grosse Luecken zwischen den Raengen (>3).
- **Einfluss auf Entscheidung:** Wenige Draw-Moeglichkeiten. Top Pair dominiert. Der Preflop-Aggressor hat meist einen starken Range-Vorteil (mehr Overpairs, bessere Top Pairs). Hohe C-Bet-Frequenzen optimal. Slow-Play ist sicherer.
- **Wann am wichtigsten:** Fuer C-Bet-Strategie und Exploitation von Spielern die auf trockenen Boards zu oft folden.

**Gapped Board (Luecken zwischen den Karten)**
- **Was es ist:** Karten mit einer oder zwei Luecken (z.B. T-8-5, Q-9-6).
- **Wie extrahieren:** Gaps zwischen 2-3 Raengen.
- **Einfluss auf Entscheidung:** Gutshots und Open-Enders moeglich aber nicht dominant. Einige Straight-Combos existieren. Mittlere C-Bet-Frequenzen angebracht.
- **Wann am wichtigsten:** Fuer Draw-Erkennung und Opponent-Range-Einschaetzung.

### 1.4 Board-Hoehe

**High Board (hohe Karten: Broadway)**
- **Was es ist:** Ueberwiegend Karten T+ (z.B. A-K-Q, K-J-T, A-Q-T).
- **Wie extrahieren:** Durchschnittlicher Rang >= 10 oder mindestens 2 Karten >= T.
- **Einfluss auf Entscheidung:** Preflop-Raiser hat massiven Range-Vorteil (mehr Broadway-Combos). Caller-Ranges treffen selten. Hohe C-Bet-Frequenzen profitabel. BB defense wird schwierig. Overpairs existieren kaum (nur AA auf K-high, AA/KK auf Q-high Boards).
- **Wann am wichtigsten:** Fuer Range-Advantage-Bestimmung und C-Bet-Sizing.

**Medium Board (mittlere Karten: 6-9)**
- **Was es ist:** Ueberwiegend mittlere Karten (z.B. 8-7-6, 9-8-5).
- **Wie extrahieren:** Durchschnittlicher Rang 6-9.
- **Einfluss auf Entscheidung:** Callers Range trifft haeufiger (suited connectors, mittlere Paare). Range-Advantage ist weniger klar. Mehr Draws moeglich. C-Bet muss selektiver sein.
- **Wann am wichtigsten:** Wenn der Caller aus dem BB kommt — sein Range ist viel breiter und trifft diese Boards ueberproportional.

**Low Board (niedrige Karten: 2-5)**
- **Was es ist:** Ueberwiegend niedrige Karten (z.B. 5-3-2, 4-3-2).
- **Wie extrahieren:** Alle Karten <= 6.
- **Einfluss auf Entscheidung:** Callers Range trifft selten gut, ABER: Sets von kleinen Pocket Pairs sind moeglich. Der Raiser hat mit Overpairs einen riesigen Vorteil. Wheel-Draws (A-2, A-3, A-4, A-5) sind im Spiel. C-Bet-Frequenz kann hoch sein, aber Sizing sollte kleiner sein (wenig fold equity noetig).
- **Wann am wichtigsten:** Fuer Sizing-Entscheidungen — auf 4-3-2 ist eine 1/3-Pot-Bet effektiver als 2/3.

### 1.5 Wet vs Dry Spektrum

**Wet Board (nass/gefaehrlich)**
- **Was es ist:** Viele Draw-Moeglichkeiten, connected, suited (z.B. Jh-Th-9c).
- **Wie extrahieren:** Kombination aus: Two-Tone/Monotone + Connected + mehrere moegliche Draws. Score berechnen: Flush-Draw-Moeglichkeit (+3), OESD-Moeglichkeit (+2), Gutshot-Moeglichkeit (+1), Board-Paarung (-2).
- **Einfluss auf Entscheidung:** Groessere Bets zum Schutz. Weniger Slow-Play. Ranges verengen sich schnell. Check-Raises werden haeufiger (sowohl als Value als auch als Semi-Bluff). Free Cards sind extrem wertvoll.
- **Wann am wichtigsten:** Fuer Bet-Sizing und Protection-Entscheidungen.

**Dry Board (trocken/sicher)**
- **Was es ist:** Wenige Draw-Moeglichkeiten, disconnected, rainbow (z.B. Kc-7d-2h).
- **Wie extrahieren:** Rainbow + Disconnected + keine nahen Karten. Wetness-Score niedrig.
- **Einfluss auf Entscheidung:** Kleinere Bets ausreichend. Slow-Play profitabler. Ranges bleiben breiter ueber mehrere Streets. Bluffs benoetigen weniger Fold Equity weil weniger Haende anrufen koennen.
- **Wann am wichtigsten:** Fuer Range-Retention (wie breit bleibt der Gegner?) und Slow-Play-Entscheidungen.

### 1.6 Turn- und River-Impact

**Turn-Karten-Kategorisierung:**

**Overcard zum Board:**
- **Was es ist:** Turn-Karte ist hoeher als alle Flopkarten (z.B. Flop 8-6-3, Turn A).
- **Einfluss:** Veraendert Range-Advantage. Ace-Turn auf niedrigem Flop gibt dem Preflop-Raiser noch mehr Advantage (mehr Ax-Combos). Kann aber auch dem BB helfen (A2-A5 suited). Ueberpruefung: Hat der Gegner am Flop gecheckt? Dann hat er wahrscheinlich kein Ace.
- **Wann wichtig:** Besonders wenn die Overcard ein Ace ist — veraendert die gesamte Hand-Dynamik.

**Flush-Draw-Komplettierung:**
- **Was es ist:** Turn-Karte bringt die dritte Karte einer Farbe (oder River die dritte/vierte).
- **Einfluss:** Jeder mit zwei Karten dieser Farbe hat jetzt einen Flush. Wer am Flop aggressiv war, koennte jetzt mit einem Flush Draw angekommen sein. Wer am Flop passiv war, hat wahrscheinlich keinen Flush (haette Semi-Bluff gespielt). Bet-Sizing muss angepasst werden.
- **Wann wichtig:** Fuer Continuation-Strategie. Wenn der Aggressor am Turn die Bremse zieht, hat er den Flush wahrscheinlich NICHT.

**Straight-Komplettierung:**
- **Was es ist:** Turn/River-Karte komplettiert moegliche Straights.
- **Einfluss:** Ueberpruefung: Welche spezifischen Holdings machen jetzt eine Straight? Sind diese Holdings in der Range des Gegners basierend auf seiner Preflop-Action? z.B. Flop 8-7-2, Turn 9 — hat der Gegner T6, JT, 65, T9? Haette er diese Haende preflop gespielt?
- **Wann wichtig:** Fuer Range-Konstruktion — nicht jede theoretische Straight ist in der tatsaechlichen Range.

**Board-Pairing:**
- **Was es ist:** Turn/River paart eine Board-Karte.
- **Einfluss:** Full Houses werden moeglich. Flushes und Straights werden relative Bluff-Catcher. Wer am Flop ein Set hatte, hat jetzt ein Full House. Wer am Flop Top Pair hatte, hat jetzt Trips (aber anfaellig fuer Full Houses). Bluffing wird attraktiver (wenige Combos schlagen Trips).
- **Wann wichtig:** Am River fuer Bluff-/Value-Entscheidungen.

**Brick (neutrale Karte):**
- **Was es ist:** Karte die nichts Wesentliches veraendert (z.B. Flop Kh-9d-4c, Turn 2s).
- **Einfluss:** Relative Handstaerke bleibt gleich. Wer am Flop vorne war, ist immer noch vorne. Continuation der vorherigen Strategie ist korrekt. Gute Barrel-Karten fuer Bluffs (der Gegner kann keine neue Staerke claimen).
- **Wann wichtig:** Fuer Multi-Street-Bluff-Planung.

### 1.7 Moegliche Made Hands auf dem Board

**Systematische Erfassung (vom staerksten zum schwaechsten):**

Fuer jedes Board muessen folgende Moeglichkeiten geprueft werden:
1. **Royal Flush** — nur bei TJQKA der gleichen Farbe auf dem Board moeglich
2. **Straight Flush** — fuenf aufeinanderfolgende Karten einer Farbe
3. **Quads** — bei gepaarten Boards oder Trips Boards
4. **Full House** — bei gepaarten Boards, Sets + Board Pair
5. **Flush** — bei mindestens 3 Karten einer Farbe auf dem Board
6. **Straight** — bei 3+ Karten innerhalb von 5 Raengen
7. **Three of a Kind (Set/Trips)** — bei ungepaarten Boards (Sets) oder gepaarten (Trips)
8. **Two Pair** — immer moeglich wenn Board ungepaired
9. **One Pair (Overpair/Top Pair/Middle Pair/Bottom Pair/Underpair)**
10. **High Card / Ace High**

Fuer jede moegliche Hand-Kategorie:
- **Combo-Count berechnen:** Wie viele spezifische Holdings machen diese Hand? (z.B. auf K-9-4 Board: Top Pair = K Combos: KQ, KJ, KT, K8s... minus Karten die auf dem Board liegen)
- **Range-Filter:** Welche dieser Combos sind in der tatsaechlichen Range des Gegners? (z.B. K2o waere Top Pair, ist aber selten in einer Open-Raise-Range)
- **Relative Staerke:** Wo steht diese Hand im Range-Ranking?

### 1.8 Draw-Moeglichkeiten

**Flush Draw:**
- **Was es ist:** Zwei Karten der gleichen Farbe auf dem Board + zwei in der Hand.
- **Equity:** ~35% am Flop (zwei Karten kommen), ~19.5% am Turn (eine Karte kommt). 9 Outs.
- **Nut Flush Draw vs Non-Nut:** Nut Flush Draw (mit Ace der Farbe) hat ~4% mehr Equity weil er nie dominated ist.
- **Einfluss:** Semi-Bluff-Kandidat. Als Blocker fuer Bluffs wertvoll (Ace der Farbe halten = Gegner hat seltener den Nut Flush). Backdoor Flush Draw (nur eine Karte der Farbe in der Hand + eine auf dem Board) hat ~4% zusaetzliche Equity am Flop.

**Open-Ended Straight Draw (OESD):**
- **Was es ist:** Vier aufeinanderfolgende Karten, zwei Enden offen.
- **Equity:** ~31.5% am Flop, ~17% am Turn. 8 Outs.
- **Einfluss:** Starker Semi-Bluff. Positions-abhaengig (IP kann besser kontrollieren ob die letzte Street kostenlos kommt). Vorsicht vor "Idiot End" — wenn eine Seite der Straight hoeher ist und der Gegner die hoehere Seite halten koennte.

**Gutshot (Inside Straight Draw):**
- **Was es ist:** Vier Karten zu einer Straight mit einer Luecke in der Mitte.
- **Equity:** ~16.5% am Flop, ~8.5% am Turn. 4 Outs.
- **Einfluss:** Allein meist nicht genug fuer einen Call. Aber als Zusatz-Equity (Gutshot + Overcards, Gutshot + Backdoor Flush) wertvoll. Exzellente Bluff-Kandidaten weil sie selten genug treffen, dass man nicht zu viel EV verliert wenn man gecallt wird, aber genug Equity haben, um nicht "reine" Bluffs zu sein.

**Double Gutshot:**
- **Was es ist:** Zwei verschiedene Gutshots gleichzeitig (z.B. 9-7 auf T-8-5 Board: braucht 6 oder J).
- **Equity:** Gleich wie OESD (~31.5%/~17%). 8 Outs.
- **Einfluss:** Oft uebersehen! Genauso stark wie ein OESD aber schwerer zu erkennen. Wichtig fuer Algorithmus: alle moeglichen Straight-Kombinationen systematisch pruefen.

**Combo Draw:**
- **Was es ist:** Flush Draw + Straight Draw gleichzeitig.
- **Equity:** Bis zu ~54% am Flop (15 Outs). Oft Favorit gegen Made Hands!
- **Einfluss:** Nahezu immer ein Raise oder All-in am Flop. Auch wenn man gecallt wird, hat man enorme Equity. Gegen ein Set hat man immer noch ~33-40%.

**Backdoor Draws:**
- **Was es ist:** Braucht zwei spezifische Karten (Turn UND River) um die Hand zu machen. Backdoor Flush = eine Karte der Farbe in Hand + eine auf dem Board. Backdoor Straight = drei Karten innerhalb von 5 Raengen zwischen Hand und Board.
- **Equity:** Jeweils ~4% zusaetzlich. Klingt wenig, aber: Backdoor Flush + Backdoor Straight = ~8% Extra-Equity. Das kann eine Grenzentscheidung (Call/Fold) massiv beeinflussen.
- **Einfluss:** Am Flop bei Grenzentscheidungen pruefen. Backdoor-Outs sind "versteckte" Equity die viele Spieler uebersehen. Fuer den Algorithmus: IMMER Backdoor-Draws zaehlen, auch wenn sie klein erscheinen.

### 1.9 Blockers (Blocker-Analyse)

**Was Blockers sind:**
Karten in unserer Hand, die bestimmte Holdings des Gegners unmoeglich oder unwahrscheinlicher machen.

**Nut-Flush-Blocker:**
- **Was:** Wir halten das Ass (oder den Koenig) der Farbe, die einen Flush ermoeglicht.
- **Extraktion:** Pruefen ob eine unserer Hole Cards das Ass/den Koenig der auf dem Board vertretenen Flush-Farbe ist.
- **Einfluss (als Bluff):** Wenn wir den Ah halten und das Board drei Herz zeigt, kann der Gegner NICHT den Nut Flush haben. Unsere Bluffs werden profitabler. Wir wissen, dass der Gegner maximal den zweitbesten Flush hat und daher eher folden wird.
- **Einfluss (als Bluff-Catcher):** Wenn wir den Ah halten und der Gegner gross bettet, ist es WAHRSCHEINLICHER, dass er blufft (er kann nicht die Nuts haben).

**Set-Blocker:**
- **Was:** Wir halten eine Karte die eine Board-Karte dupliziert.
- **Extraktion:** Pruefen ob eine Hole Card den gleichen Rang wie eine Board-Karte hat.
- **Einfluss:** Wenn wir einen Koenig halten auf einem K-9-4 Board, hat der Gegner maximal 3 statt 6 Combos von KK (Set) und maximal 9 statt 12 Combos von Kx (Top Pair). Unsere Hand blockiert die Staerke des Gegners.

**Straight-Blocker:**
- **Was:** Wir halten Karten die Straight-Combos des Gegners reduzieren.
- **Extraktion:** Karten identifizieren die fuer moegliche Straights benoetigt werden und pruefen ob wir sie halten.
- **Einfluss:** Auf einem J-T-7 Board blockiert eine 8 in unserer Hand die Haelfte aller 89-Combos und einen Teil der 86-Combos.

**Blocker-Paradox:**
- **Wichtig:** Blocker die gut fuer Bluffs sind, sind schlecht fuer Value-Bets und umgekehrt. Wenn wir Kx halten auf K-9-4 und betten: Wir blockieren Top Pair (gut, er foldet haeufiger), aber wir blockieren auch seine Calling-Range (schlecht, er haette uns mit Kx gecallt). Die Kunst ist zu wissen, ob wir bluff-blockern wollen (wir wollen CALLEN und der Gegner soll keine Nuts haben) oder value-blockern wollen (wir wollen BETTEN und der Gegner soll nicht folden).

### 1.10 Board Coverage / Range Advantage

**Was es ist:**
Welcher Spieler hat mehr starke Haende auf diesem spezifischen Board? Der Spieler mit dem "Range Advantage" hat die Nuts haeufiger in seinem Range.

**Wie extrahieren:**
- Preflop-Ranges beider Spieler rekonstruieren (basierend auf Actions).
- Diese Ranges gegen das Board matchen.
- Zaehlen: Wer hat mehr Top-10%-Haende? Wer hat die absoluten Nuts haeufiger?
- Wer hat mehr "Luft" (Haende die komplett verfehlt haben)?

**Equity-Distribution:**
- **Nut Advantage:** Wer hat die besten Haende? (z.B. auf A-K-Q hat der Preflop-3-Bettor mehr AA, KK, AK Combos)
- **Mittlere Staerke:** Wer hat mehr "mittelstarke" Haende wie Top Pair mit gutem Kicker?
- **Air:** Wer hat mehr komplette Misses?

**Einfluss auf Entscheidung:**
- Der Spieler mit Range Advantage kann haeufiger C-Betten und groesser betten.
- Der Spieler OHNE Range Advantage muss defensiver spielen und oefter Check-Raisen statt Donk-Betten.
- Range Advantage bestimmt, wer der "Aggressor" auf jeder Street sein sollte.

**Wann am wichtigsten:** Am Flop fuer die fundamentale Strategie-Wahl (bet vs check, sizing). Aendert sich mit jeder neuen Community Card!

---

## 2. OPPONENT BETTING PATTERNS (Gegner-Aktionsmuster)

### 2.1 Bet-Sizing-Tells

**Small Bet (25-35% Pot):**
- **Was es ist:** Eine ungewoehnlich kleine Bet relativ zum Pot.
- **Wie extrahieren:** Bet-Groesse / Pot-Groesse berechnen. Unter 35% = Small Bet.
- **Einfluss auf Entscheidung:** 
  - Bei GUTEN Spielern: Polarisiert (entweder sehr starke Hand die nicht vertreiben will, oder ein schwacher Bluff der wenig riskieren will). Oft Teil einer Thin Value Strategie oder einer Block-Bet (um eine groessere Bet des Gegners zu verhindern).
  - Bei SCHWACHEN Spielern: Fast immer Schwaeche. "Ich will sehen wo ich stehe." Raise-Kandidat.
  - Auf DRY Boards: Von Regulars als optimales Sizing genutzt (wenig Fold Equity noetig).
- **Wann am wichtigsten:** Auf trockenen Boards und in Small-Pot-Situationen. Wenn ein normalerweise aggressiver Spieler ploetzlich klein bettet.

**Standard Bet (50-70% Pot):**
- **Was es ist:** Die "Default"-Bet-Groesse.
- **Wie extrahieren:** Bet/Pot zwischen 0.5 und 0.7.
- **Einfluss auf Entscheidung:** Gibt wenig spezifische Information. Der Gegner koennte alles haben. Entscheidung basiert hauptsaechlich auf eigener Handstaerke und Board Texture. Bei Spielern die IMMER 50-60% betten: kein Sizing-Tell, muss anders gelesen werden.
- **Wann am wichtigsten:** Als Baseline — Abweichungen von der Standard-Bet eines spezifischen Spielers sind informativer als die Bet selbst.

**Large Bet (75-100% Pot):**
- **Was es ist:** Eine grosse Bet nahe der Pot-Groesse.
- **Wie extrahieren:** Bet/Pot >= 0.75.
- **Einfluss auf Entscheidung:**
  - Auf WET Boards: Oft Value + Protection. Der Gegner will Draws nicht billig weiterspielen lassen. Starke Made Hands oder starke Semi-Bluffs.
  - Auf DRY Boards: Polarisiert. Entweder Nuts oder Bluff. Mittlere Haende betten selten gross auf trockenen Boards. Bluff-Catcher-Entscheidungen werden haeufiger.
  - Multi-Street: Wenn jemand Flop, Turn UND River gross bettet, ist der Range extrem stark oder es ist ein elaborierter Bluff.
- **Wann am wichtigsten:** Am Turn und River, wo grosse Bets den Pot schnell eskalieren.

**Overbet (>100% Pot):**
- **Was es ist:** Eine Bet die groesser als der Pot ist.
- **Wie extrahieren:** Bet/Pot > 1.0.
- **Einfluss auf Entscheidung:**
  - Bei GUTEN Spielern: Hoch polarisiert. Entweder absolute Nuts (die maximalen Value extrahieren wollen) oder pure Bluffs (die maximalen Fold-Equity wollen). KEINE mittleren Haende. Korrekte Response: Nur mit sehr starken Haenden oder als Bluff-Catcher callen, mittlere Haende folden.
  - Bei SCHWACHEN Spielern: Ueblicherweise die Nuts. Selten ein Bluff. Exploitative Response: Mehr folden.
  - MDF gegen Overbet: Bei 150% Pot Overbet muss man nur ~40% des Ranges verteidigen (statt ~60% gegen Pot-Bet).
- **Wann am wichtigsten:** Am River fuer die groessten Pot-Entscheidungen. Am Turn als "Pot-Builder" fuer River-Shoves.

**All-In:**
- **Was es ist:** Spieler setzt seinen gesamten Stack.
- **Wie extrahieren:** Bet >= Remaining Stack.
- **Einfluss auf Entscheidung:** Haengt stark vom SPR ab. Bei niedrigem SPR (< 3) kann ein All-In relativ "normal" sein mit Top Pair+. Bei hohem SPR (> 10) ist ein All-In fast immer die Nuts oder ein monumentaler Bluff. Pot Odds berechnen und gegen geschaetzte Range vergleichen.
- **Wann am wichtigsten:** Immer. Groesste Entscheidung im Poker.

### 2.2 Timing Tells

**Snap-Call (sofortiger Call):**
- **Was es ist:** Gegner callt innerhalb von 1-2 Sekunden.
- **Wie extrahieren:** Aktions-Timer < 2 Sekunden.
- **Einfluss auf Entscheidung:** Zeigt eine Hand die "gut genug zum Callen aber nicht gut genug zum Raisen" ist. Der Gegner hat nicht ueber einen Raise nachgedacht. Typisch: Mittlere Made Hands, Flush Draws. SELTEN die Nuts (wuerde ueber Raise nachdenken). Barrel am Turn wird profitabler (er hat eine capped Range).
- **Wann am wichtigsten:** Am Flop und Turn fuer Multi-Street-Planung.

**Snap-Bet/Raise (sofortige Aggression):**
- **Was es ist:** Gegner bettet oder raised innerhalb von 1-2 Sekunden.
- **Einfluss auf Entscheidung:** Oft Staerke. Der Gegner wusste schon VOR der Action, dass er betten/raisen wollte. Kann aber auch ein "verzweifelter" Bluff sein der schnell handelt um Staerke vorzutaeuschen. Kontext-abhaengig: Am River = meist Staerke. Am Flop auf draw-heavem Board = kann Semi-Bluff sein.

**Tank (langes Nachdenken, >10 Sekunden):**
- **Was es ist:** Gegner denkt lange nach vor einer Aktion.
- **Einfluss auf Entscheidung:**
  - Tank-Call: Der Gegner hat ueber Fold nachgedacht. Zeigt einen marginalen Call, wahrscheinlich schwache Made Hand oder Draw. Am River = Bluff-Catcher, kein Monster.
  - Tank-Raise: SEHR stark. Der Gegner hat ueber die Groesse nachgedacht, nicht ueber die Aktion. Oft Nuts oder nahe Nuts. Caution!
  - Tank-Bet: Kann Schwaeche sein (ueberlegt ob der Bluff funktioniert) oder genuines Nachdenken ueber Sizing.
  - Tank-Fold: Zeigt Stressresistenz. Der Gegner hatte eine anstaendige Hand. Information fuer spaetere Haende.
- **Wann am wichtigsten:** Am River bei grossen Pot-Entscheidungen. Vorsicht: Erfahrene Spieler koennen Timing-Tells manipulieren (absichtlich langsam mit starken Haenden).

**Timing-Tell-Zuverlaessigkeit:**
- Online: Weniger zuverlaessig (Multi-Tabling, Verbindungsprobleme).
- Live: Sehr zuverlaessig bei unerfahrenen Spielern.
- Grundregel: Die ERSTE Timing-Beobachtung bei einem neuen Gegner ist am wertvollsten. Nach dem dritten Mal ist der Spieler moeglicherweise aware und manipuliert.

### 2.3 Check-Raise Patterns

**Was ein Check-Raise ist:**
Out of Position checken und dann die Bet des Gegners raisen.

**Frequenz-Analyse:**
- **Hohe Check-Raise-Frequenz (>15%):** Aggressiver Spieler. Respektieren — aber auch oefter bluffen wenn er nicht check-raised.
- **Niedrige Check-Raise-Frequenz (<5%):** Fast immer die Nuts. Wenn dieser Spieler check-raised, hat er ein Monster. Easy fold mit allem ausser den staerksten Haenden.
- **Null Check-Raise-Frequenz:** Extrem exploitable. Man kann in Position mit sehr hoher Frequenz betten weil keine Gefahr eines Check-Raises besteht.

**Board-Texture-abhaengige Check-Raises:**
- **Dry Board Check-Raise (z.B. K-7-2r):** Fast immer ein Set oder starkes Two Pair. Sehr wenige Semi-Bluff-Combos auf trockenen Boards. Starkes Foldsignal fuer One-Pair-Haende.
- **Wet Board Check-Raise (z.B. 9h-8h-7c):** Breiterer Range — Sets, Two Pairs, OESD+Flush Draws, Combo Draws, sogar nackte Flush Draws. Muss breiter gecallt werden.
- **Paired Board Check-Raise:** Trips oder Full House. Sehr eng und sehr stark.

**Street-spezifische Check-Raise-Interpretation:**
- **Flop Check-Raise:** Kann Value oder Semi-Bluff sein. Breiteste Range.
- **Turn Check-Raise:** Signifikant staerker. Semi-Bluffs werden seltener (nur noch eine Karte kommt). Sehr oft die Nuts.
- **River Check-Raise:** Fast ausschliesslich die Nuts. Der Gegner hat die gesamte Hand passiv gespielt und raised jetzt am River? Zwei Moeglichkeiten: (1) Slowplayed Monster, oder (2) Perfekter Bluff-Spot (sehr selten bei Low-Stakes). Default: Fold alles ausser der Nuts.

### 2.4 Donk-Bet Patterns

**Was eine Donk-Bet ist:**
Der Spieler der OUT of Position ist und NICHT der Preflop-Aggressor war, bettet als Erster in den Pot.

**Frequenz:**
- **GTO-maessig:** Donk-Bets kommen fast nie vor (der Preflop-Aggressor hat Range Advantage und sollte die Betting-Initiative haben).
- **In der Praxis:** Donk-Bets zeigen meist unerfahrene Spieler.

**Interpretation nach Spielertyp:**
- **Recreational Player Donk-Bet:** Ueberwiegend ein Draw oder schwaches Made Hand. "Ich habe etwas getroffen und will es schuetzen." Raise mit starken Haenden fuer Value.
- **Regular Donk-Bet:** Auf spezifischen Board-Texturen wo der Caller Range-Advantage hat (z.B. BB vs BTN auf 5-6-7). Kann Teil einer ausbalancierten Strategie sein.
- **Small Donk-Bet (25-33%):** Fast immer ein "Blocker-Bet" — der Spieler will billig zur naechsten Karte kommen. Raise als Bluff profitabel.
- **Large Donk-Bet (75%+):** Oft genuines Value. Der Spieler hat eine starke Hand und will nicht riskieren, dass der Aggressor checkt behind.

**Wann am wichtigsten:** Am Flop fuer die sofortige Einschaetzung des Gegners als Recreational vs Regular. Am Turn wenn ein Draw ankommt (Donk-Bet auf Turn-Karte die einen Draw komplettiert = oft die gemachte Hand).

### 2.5 Multi-Street Aggression Lines

**Bet-Bet-Bet (Triple Barrel):**
- **Was es ist:** Der Spieler bettet auf allen drei Postflop-Streets.
- **Interpretation:** Extrem polarisiert. Entweder (1) starke Made Hand (Top Pair+, Overpair, Set, besseres) die Value extrahiert, oder (2) ein Bluff der die Geschichte "durchzieht." Mittlere Haende betten NIEMALS dreimal.
- **Einfluss:** Wenn der Gegner am River nach Bet-Bet eine dritte Bet macht, muessen wir entscheiden: Bluff oder Value? Schauen auf: Blocker (blockieren wir seine Value-Haende?), Board-Runout (ist ein Draw angekommen?), Spielertyp (blufft er Triple-Barrel-Frequenz?).
- **Wann wichtig:** Am River — die teuerste Entscheidung der Hand.

**Bet-Bet-Check:**
- **Was es ist:** Bet am Flop und Turn, Check am River.
- **Interpretation:** Der Gegner hat am River die Bremse gezogen. Moeglich: (1) Er hat Value auf Flop/Turn gebettet und am River aufgehoert weil eine Scare Card kam. (2) Er hatte ein Semi-Bluff-Draw das nicht angekommen ist. (3) Er hat Showdown Value und will billig zum Showdown.
- **Einfluss:** Wir koennen am River oft mit Bluffs betten (er ist capped). Aber auch mit mittleren Haenden Value-Betten (er hat selten die Nuts).

**Bet-Check-Bet:**
- **Was es ist:** Bet am Flop, Check am Turn, Bet am River.
- **Interpretation:** Der Turn-Check ist verdaechtig. Moeglichkeiten: (1) Slow-Play — er hat am Turn gecheckt um am River eine grosse Bet zu placieren. (2) Pot-Control mit mittelstarker Hand am Turn, dann Value-Bet am River. (3) "Delayed Bluff" — er hat am Turn aufgegeben und versucht es am River nochmal.
- **Einfluss:** Die Turn-Check verrät: Wenn der Gegner am Turn gecheckt hat, hat er wahrscheinlich keine super-starke Hand (haette am Turn weiter gebettet fuer Value). AUSNAHME: Set auf nassem Board das am Turn trocken wird — Slow-Play moeglich.

**Check-Bet-Bet:**
- **Was es ist:** Check am Flop, Bet am Turn und River.
- **Interpretation:** Am Flop gecheckt (Schwaeche oder Trap?), dann ab dem Turn aggressiv. Moeglichkeiten: (1) Trap am Flop mit Monster. (2) Turn-Karte hat ihm geholfen (Draw angekommen, Overcard getroffen). (3) "Float" am Flop als Bluff-Setup.
- **Einfluss:** Wenn die Turn-Karte offensichtlich hilft (z.B. Flush-Karte kommt und er startet zu betten), ist die Line glaubwuerdig. Wenn die Turn-Karte ein Brick ist und er ploetzlich bettet — entweder Slow-Play oder Bluff.

**Check-Check-Bet (River-Only Bet):**
- **Was es ist:** Passiv am Flop und Turn, dann ploetzlich eine Bet am River.
- **Interpretation:** (1) Gecheckte Nuts fuer Slow-Play (GEFAEHRLICH). (2) "Desperation Bluff" — er hat realisiert, dass er am Showdown nicht gewinnen kann und versucht am River einen letzten Bluff. (3) River-Karte hat ihm geholfen.
- **Einfluss:** Gegen Regulars: Oft Staerke (sie haetten frueher gebettet wenn sie bluffen wollten). Gegen Recreationals: Kann beides sein.

### 2.6 Was ein CHECK bedeutet

**Fundamentale Check-Analyse:**
Ein Check ist KEINE neutrale Aktion. Ein Check verrät, dass der Spieler seine Hand nicht als stark genug zum Betten bewertet hat.

**Range-Capping durch Check:**
- **Was es ist:** Wenn ein Spieler checkt, "cappt" er seinen Range — er hat wahrscheinlich nicht die staerksten Haende.
- **AUSNAHME:** Slow-Play existiert. Aber die meisten Spieler slow-playen seltener als sie sollten.
- **Quantifizierung:** Nach einem Check entfallen typischerweise 70-90% der Nut-Combos aus dem Range des Spielers (bei Recreational-Spielern sogar nahe 100%).

**Position-abhaengige Check-Interpretation:**
- **OOP Check zum Preflop-Aggressor:** Standard. Kann alles sein von Air bis Monster (Slow-Play). Weniger informativ.
- **IP Check-Behind nach OOP-Check:** Der Spieler hat die Chance zum Betten aufgegeben. Starkes Capping. Zeigt schwache Made Hand, Give-Up, oder deliberates Pot-Control. Sehr informativ fuer die naechste Street.
- **OOP Check zum Non-Aggressor:** Ungewoehnlich in C-Bet-Situationen. Zeigt entweder Trap oder echte Schwaeche.

**Doppel-Check (Flop + Turn Check):**
- **Was es ist:** Spieler checkt auf zwei aufeinanderfolgenden Streets.
- **Interpretation:** Range ist stark gecappt. Kaum starke Haende uebrig (ausser seltene Slow-Plays). Ideal fuer Bluffs. Auch schwache Made Hands (Middle Pair, Bottom Pair) koennen Value-Betten.
- **Wann wichtig:** Am Turn/River fuer Bluff-Spots. "Wenn er zweimal gecheckt hat, kann ich mit fast allem bluffen."

### 2.7 Preflop Patterns

**Limp (Open-Limp):**
- **Was es ist:** Ein Spieler callt den Big Blind statt zu raisen.
- **Interpretation:** Fast immer ein Recreational Player (Regulars open-limpen so gut wie nie). Zeigt einen breiten, passiven Range: kleine Pocket Pairs, suited Connectors, schwache Broadway, suited Aces. ABER: Limp-Reraise (Limp, dann Raise nach einem Raise) = fast immer AA oder KK. Extrem starkes Tell.
- **Einfluss:** Gegen Limper groessere Isolation-Raises machen. Breiter fuer Value raisen. Im Multiway-Pot vorsichtiger sein.

**Open-Raise Sizing:**
- **Min-Raise (2x):** Bei Online-Regulars standard. Im Live-Poker oft Staerke (AA/KK die Action wollen).
- **3x Raise:** Standard-Sizing in den meisten Spielen.
- **4x+ Raise:** Oft Recreation-Player mit Premium-Hand. Oder: "Ich will die Blinds nicht sehen, nehmt meinen Raise ernst."
- **Einfluss:** Sizing-Tells sind spielerabhaengig. Muster ueber mehrere Haende tracken: Wenn Spieler X immer 2.5x raised aber ploetzlich 4x raised — ungewoehnlich, wahrscheinlich Premium.

**3-Bet:**
- **Was es ist:** Ein Re-Raise ueber den initialen Open-Raise.
- **Interpretation nach Frequenz:**
  - Niedrige 3-Bet-Frequenz (<5%): Fast nur Premium (QQ+, AK). Wenn dieser Spieler 3-bettet, brauchen wir QQ+ oder AK um zu callen.
  - Mittlere 3-Bet-Frequenz (5-9%): Gutes Range-Mixing — Premiums + einige Bluffs (A5s, A4s, KJs, etc.).
  - Hohe 3-Bet-Frequenz (>10%): Aggressiver Spieler, breiter Range. Mehr Bluffs enthalten. Breitere 4-Bets und Calls gerechtfertigt.
- **Position-abhaengig:** 3-Bet aus dem SB/BB ist haeufiger (Blinds verteidigen). 3-Bet aus UTG ist selten und zeigt extreme Staerke.

**Cold-Call (Call einer 3-Bet):**
- **Was es ist:** Eine 3-Bet callen (nicht 4-betten, nicht folden).
- **Interpretation:** Range von mittleren Pocket Pairs (TT-JJ), AQs, AJs, KQs. NICHT die absoluten Premiums (wuerden 4-betten) und NICHT schwache Haende (wuerden folden). Sehr definierter Range.
- **Einfluss:** Auf dem Flop wissen wir relativ genau, was der Cold-Caller haben kann.

**Squeeze:**
- **Was es ist:** 3-Bet nach einem Open-Raise UND mindestens einem Call.
- **Interpretation:** Breiterer Bluffing-Range als eine normale 3-Bet (mehr Fold Equity weil 2+ Spieler folden muessen). Zeigt entweder Premium-Hand die den Pot vergroessern will, oder eine Semi-Bluff-Hand die die toten Chips einsammeln will.

### 2.8 Fold-Patterns

**Fold to C-Bet:**
- **Hohe Fold-to-C-Bet-Rate (>65%):** Spieler foldet zu oft auf C-Bets. Profitabel: Mit hoher Frequenz C-Betten, auch ohne Hand. Kleine Sizing reicht.
- **Niedrige Fold-to-C-Bet-Rate (<40%):** Spieler callt zu oft. Bluff-C-Bets verlieren Geld. Nur fuer Value C-Betten.
- **Differenzierung Flop/Turn/River:** Manche Spieler folden am Flop nie, aber geben am Turn auf. Andere callen durch bis zum Showdown. Street-spezifische Fold-Rates sind wertvoller als eine Gesamtzahl.

**Fold to 3-Bet:**
- **>70%:** Exploitbar. Haeufiger 3-Betten (light 3-bets). Jede 3-Bet hat direkte Profit-Erwartung.
- **<50%:** Vorsicht mit Light 3-Bets. Nur mit genuiner Staerke oder starken Semi-Bluffs 3-betten.

---

## 3. OUR OWN HAND INFORMATION (Eigene Hand-Analyse)

### 3.1 Absolute Handstaerke

**Was es ist:** Die objektive Staerke unserer Hand basierend auf der Pokerhand-Hierarchie.

**Hierarchie (staerkste zuerst):**
1. Royal Flush
2. Straight Flush
3. Four of a Kind (Quads)
4. Full House
5. Flush
6. Straight
7. Three of a Kind (Set/Trips)
8. Two Pair
9. One Pair (unterteilt in: Overpair, Top Pair Top Kicker, Top Pair Good Kicker, Top Pair Weak Kicker, Second Pair, Third Pair, Underpair, Pocket Pair below Board)
10. High Card (Ace High, King High, etc.)

**Wie extrahieren:** Kombination von Hole Cards + Board-Karten auswerten. Standard-Poker-Hand-Evaluator.

**Einfluss:** Basis fuer jede Entscheidung. Aber NICHT allein entscheidend — relative Staerke ist wichtiger.

### 3.2 Relative Handstaerke

**Was es ist:** Wie stark ist unsere Hand RELATIV zum Board und zum geschaetzten Range des Gegners?

**Konzept:** Top Pair ist auf K-7-2r extrem stark (wenige bessere Haende moeglich). Top Pair ist auf J-T-9-8 extrem schwach (viele Straights, Two Pairs moeglich).

**Wie messen:**
- **Equity vs Range:** Unsere Hand-Equity gegen den geschaetzten Range des Gegners berechnen.
- **Range-Percentile:** Wo steht unsere Hand im Range-Ranking? Top 5%? Top 30%? Bottom 50%?
- **Board-Dynamik:** Wie veraendert sich unsere relative Staerke mit moeglichen Turn/River-Karten?

**Einfluss auf Entscheidung:**
- Hand im Top 10% des Ranges → Thick Value Bet
- Hand im 10-30% → Thin Value Bet / Call
- Hand im 30-60% → Bluff-Catcher / Marginaler Call
- Hand im 60-100% → Check/Fold oder Bluff-Kandidat

### 3.3 Kicker-Staerke

**Was es ist:** Die zweite Karte in unserer Hand, die bei gleicher Pair-Staerke entscheidet.

**Wie extrahieren:** Wenn wir ein Pair haben, ist der Kicker die andere Hole Card (wenn das Pair mit einer Board-Karte gebildet wird) oder die hoechste Board-Karte (wenn wir ein Pocket Pair haben).

**Einfluss auf Entscheidung:**
- **Top Pair Top Kicker (TPTK):** z.B. AK auf K-9-4. Stabile Value-Hand. Fast immer eine Bet wert.
- **Top Pair Good Kicker:** z.B. KQ auf K-9-4. Immer noch stark, aber gegen TPTK dominiert.
- **Top Pair Weak Kicker:** z.B. K7 auf K-9-4. Marginal. Oft nur ein Check-Call wert. Kicker-Probleme bei grossen Pots.
- **Outkicked-Szenarien:** Wenn der Gegner gross bettet und wir Top Pair Weak Kicker haben — wir verlieren gegen alle besseren Kicker-Combos. Dies sind die teuersten Fehler im Poker.

**Wann am wichtigsten:** Bei gepaarten Boards, bei Board-Texturen wo viele Spieler Top Pair haben koennten (z.B. A-high Boards wo viele Ax-Haende im Spiel sind).

### 3.4 Blocker die wir halten

(Detailliert in Sektion 1.9 beschrieben — hier die Hand-Perspektive)

**Fuer Bluff-Entscheidungen:**
- Halten wir Karten die Value-Haende des Gegners blockieren? → Bluff wird profitabler.
- Halten wir Karten die Bluff-Haende des Gegners blockieren? → Wir sollten NICHT bluffen (er hat weniger Bluffs in seinem Range, also auch weniger Folds).

**Fuer Call-Entscheidungen:**
- Halten wir Karten die die Nuts des Gegners blockieren? → Call wird profitabler (er hat seltener die Nuts).
- Halten wir Karten die Bluffs des Gegners blockieren? → Fold wird korrekt (er blufft seltener).

**Beispiel-Situation:**
Board: Ah-Kh-7c-3h-2d (River). Gegner bettet Pot.
- Wir halten Qh-Jd: Wir blockieren den Nut Flush NICHT (Ah ist auf dem Board, also Kh ist Nut Flush... wir halten keinen Herz-Blocker). Wir blockieren KK (Set) leicht. Wir blockieren QJ als Bluff-Hand.
- Wir halten Th-Td: Wir blockieren einen Flush (Th). Der Gegner hat seltener einen Flush. Unser Call wird besser, weil er oefter blufft.

### 3.5 Backdoor Draws (aus unserer Perspektive)

**Was es ist:** Draws die zwei perfekte Karten benoetigen (Turn UND River).

**Typen:**
- **Backdoor Flush Draw:** Eine Karte unserer Farbe auf dem Board + unsere zwei Karten der gleichen Farbe (z.B. wir halten 8h-7h, Flop Kh-9c-3d — ein Herz auf dem Board + zwei in der Hand).
  - Equity-Zuschlag: ~4%
- **Backdoor Straight Draw:** Drei Karten (Hand + Board) innerhalb von 5 Raengen, brauchen zwei spezifische Karten.
  - Equity-Zuschlag: ~2-4% (abhaengig von der Anzahl der Outs)

**Einfluss auf Entscheidung:**
- Am Flop bei Grenzentscheidungen (knapper Call vs Fold): Backdoor-Equity kann den Ausschlag geben.
- Fuer Semi-Bluff-Planung: Eine Hand mit Backdoor Flush + Backdoor Straight kann am Flop als Bluff gespielt werden, weil sie am Turn in viele verschiedene Draws "morphen" kann.
- **Key Insight:** Backdoor-Draws sind am Flop am wertvollsten und verlieren am Turn ihre Bedeutung (sie werden entweder "echte" Draws oder verschwinden).

### 3.6 Nut Potential

**Was es ist:** Wie wahrscheinlich ist es, dass unsere Hand sich zur best-moeglichen Hand verbessert?

**Beispiele:**
- **Hohes Nut Potential:** Nut Flush Draw (Ace der Suit). Wenn der Flush ankommt, haben wir die Nuts.
- **Hohes Nut Potential:** Set (z.B. 77 auf 7-9-K Board). Wenn das Board paart, haben wir ein Full House.
- **Niedriges Nut Potential:** Niedrige Straight Draws (z.B. 5-4 auf 8-7-6 Board — wir haben die untere Straight, aber 9-T haette die hoehe Straight). Reverse Domination moeglich.
- **Kein Nut Potential:** Mittlere Pairs ohne Verbesserungsmoeglichkeit (z.B. JJ auf A-K-Q Board).

**Einfluss auf Entscheidung:**
- Hohes Nut Potential = hoehere Implied Odds. Wir koennen grosse Pots gewinnen wenn wir treffen.
- Niedriges Nut Potential = niedrigere Implied Odds oder sogar Reverse Implied Odds. Wir koennten treffen und trotzdem verlieren.

### 3.7 Reverse Implied Odds

**Was es ist:** Die erwarteten Verluste wenn unsere Hand sich "verbessert" aber trotzdem verliert.

**Klassische Beispiele:**
- **Dominated Flush Draw:** Wir halten Th-8h, Board hat Ah-Kh-3c. Wenn der Flush ankommt, hat jeder mit einem hoeheren Herz einen besseren Flush. Wir koennten einen kleinen Flush machen und einen grossen Pot verlieren.
- **Unteres Ende einer Straight:** 4-3 auf 7-6-5 Board. Wir haben die "Idiot End" Straight. Jeder mit 8-4, 8-9, 9-T hat eine hoehere Straight.
- **Set vs hoeheres Set:** Wir halten 44 auf K-4-2 Board. Wenn wir All-in gehen, verlieren wir gegen KK (Set von Koenigen). Selten, aber katastrophal.

**Einfluss auf Entscheidung:**
- Haende mit hohen Reverse Implied Odds sollten WENIGER aggressiv gespielt werden.
- Calls mit niedrigen Flush Draws oder Low-End Straights sind oft schlechter als sie aussehen.
- Faustregel: "Treffe ich und verliere trotzdem manchmal?" → Reverse Implied Odds abziehen.

### 3.8 Hand-Vulnerabilitaet

**Was es ist:** Wie anfaellig ist unsere Hand dafuer, von nachfolgenden Community Cards ueberholt zu werden?

**Hoch vulnerable Haende:**
- Overpair auf nassem Board (z.B. QQ auf 9-8-7 Board — jede T, J, 6, 5 ist gefaehrlich)
- Top Pair auf einem Draw-Heavy Board
- Two Pair auf einem Board mit Flush- und Straight-Draws

**Niedrig vulnerable Haende:**
- Nuts (z.B. Nut Flush — nur Full House kann uns schlagen)
- Set auf trockenem Board
- Straights auf Boards ohne Flush-Moeglichkeit

**Einfluss auf Entscheidung:**
- Hoch vulnerable Haende → Groesser betten (Protection). Wir wollen nicht, dass der Gegner billig seine Draws sieht.
- Niedrig vulnerable Haende → Kleiner betten oder slow-playen. Wir koennen dem Gegner die Chance geben, etwas zu machen was er dann verliert.
- **Key Insight:** Der haeufigste Anfaengerfehler ist, vulnerable Haende zu slow-playen. "Ich habe Top Pair, lass mich trappen" — NEIN. Wenn 40% der Turn-Karten deine Hand ruinieren, BETTE JETZT.

---

## 4. POSITIONAL INFORMATION (Positions-Analyse)

### 4.1 Position am Tisch (6-Max)

**Positionen (von frueh nach spaet):**
1. **UTG (Under the Gun):** Erste Position nach den Blinds. Engster Opening Range (~15-18% der Haende).
2. **HJ (Hijack):** Zweite Position. Etwas breiterer Range (~18-22%).
3. **CO (Cutoff):** Dritte Position. Breiter Range (~25-30%).
4. **BTN (Button):** Letzte Position preflop (nach den Blinds). Breitester Range (~40-50%).
5. **SB (Small Blind):** Schlechteste Postflop-Position (muss zuerst handeln). 3-Bet-or-Fold-Strategie oft optimal.
6. **BB (Big Blind):** Bekommt bereits investierte Odds. Breitester Defense-Range.

**Wie extrahieren:** Sitzposition relativ zum Dealer-Button.

**Einfluss auf Entscheidung:**
- Fruehere Positionen = engere Ranges = staerkere Haende im Durchschnitt.
- Ein UTG-Open zeigt mehr Staerke als ein BTN-Open.
- Wenn ein UTG-Spieler 3-bettet wird und 4-bettet, hat er fast sicher AA/KK.

### 4.2 In Position (IP) vs Out of Position (OOP)

**Was es ist:**
- **IP (In Position):** Du handelst NACH dem Gegner auf jeder Postflop-Street. Du siehst immer zuerst, was er macht.
- **OOP (Out of Position):** Du musst ZUERST handeln. Du gibst Information preis, bevor du Information bekommst.

**Wie extrahieren:** Vergleiche unsere Sitzposition mit der des Gegners relativ zum Dealer-Button. Der Spieler naeher zum Button (oder auf dem Button) ist IP.

**Strategische Auswirkungen:**

**IP-Vorteile:**
- Wir koennen checken wenn er checkt (Free Card nehmen).
- Wir koennen betten wenn er checkt (Bluff oder Value).
- Wir sehen seine Aktion bevor wir entscheiden.
- Wir koennen Pot-Groesse besser kontrollieren.
- **Equity-Realisierung:** IP realisieren wir ~5-10% mehr unserer theoretischen Equity.

**OOP-Nachteile:**
- Wir muessen zuerst handeln = wir geben Information preis.
- Check-Raising ist unsere staerkste Waffe (erzwingt 2x Aktion).
- Wir muessen oefter folden (koennen Pot-Groesse schlecht kontrollieren).
- Schwache Made Hands verlieren OOP massiv an Wert.

**Einfluss auf Entscheidung:**
- IP: Breitere Ranges spielen. Mehr floaten (Flop callen mit der Absicht, spaeter zu bluffen). Mehr Pot-Control mit mittleren Haenden.
- OOP: Engere Ranges spielen. Polarisierter spielen (starke Haende aggressiv, schwache Haende aufgeben). Check-Raise als primaere Aggressionswaffe nutzen.

### 4.3 Position relativ zum Aggressor

**Was es ist:** Nicht nur wer IP/OOP ist, sondern wer der AGGRESSOR der Hand ist und wo wir relativ zu ihm sitzen.

**Szenarien:**
- **Wir sind der Preflop-Aggressor, IP:** Ideale Situation. Wir haben Range-Advantage UND Position. Hohe C-Bet-Frequenzen profitabel.
- **Wir sind der Preflop-Aggressor, OOP:** Schwierigere Situation. Wir haben Range-Advantage aber nicht Position. C-Bet muss selektiver sein. Auf Boards die den Caller favorisieren oefter checken.
- **Wir sind der Preflop-Caller, IP:** Wir haben Position aber nicht Range-Advantage. Floaten (Flop callen und spaeter uebernehmen) ist die primaere Strategie.
- **Wir sind der Preflop-Caller, OOP (typisch: BB):** Schwierigste Situation. Wir haben weder Range-Advantage noch Position. Check-Call oder Check-Raise sind die einzigen Optionen. Donk-Bets nur auf spezifischen Boards.

### 4.4 Multiway-Position

**Was es ist:** In Pots mit 3+ Spielern wird Position noch wichtiger.

**Sandwich-Effekt:**
- Wenn wir in der Mitte sitzen (ein Spieler vor uns, einer nach uns), ist unsere Position am schlechtesten. Wir koennen vom Spieler hinter uns squeezed/raised werden.
- **Einfluss:** In Sandwich-Positionen viel enger spielen. Haende wie Top Pair Weak Kicker verlieren enorm an Wert.

**Last-to-Act in Multiway:**
- Der letzte Spieler hat alle Informationen. Wenn alle vor ihm checken, kann er mit breitem Range bluffen.
- Wenn jemand bettet und alle callen, kann der letzte Spieler am genauesten raisen (er weiss, gegen wie viele Ranges er rangemaeßig steht).

---

## 5. POT GEOMETRY & STACK SIZES (Pot-Geometrie & Stack-Groessen)

### 5.1 Stack-to-Pot Ratio (SPR)

**Was es ist:** Effektiver Stack / Pot-Groesse nach dem Flop. Entscheidend fuer die gesamte Postflop-Strategie.

**Wie berechnen:** SPR = Effektiver Stack (der kleinere der beiden Stacks) / Pot nach Flop-Dealing (vor Flop-Action).

**Interpretation:**

**Niedriger SPR (0-3):**
- Commitment-Threshold ist schnell erreicht. Top Pair + guter Kicker ist oft eine "go-broke" Hand.
- Draws sind weniger profitabel (nicht genug Implied Odds).
- Bluffs kosten relativ wenig (kleiner Pot = guenstige Bluffs), ABER der Gegner foldet seltener (er ist fast committed).
- Strategie: Einfach, "math-basiert." Wenn unsere Equity > 50% gegen seinen Range ist → All-in.
- Typisch in: 3-Bet-Pots, Short-Stack-Situationen, Turnier-Bubbles.

**Mittlerer SPR (3-8):**
- Standard-Situationen. Alle Optionen offen.
- Overpairs und starke Top Pairs sind starke Haende. Sets sind Monsters.
- Draws haben moderate Implied Odds.
- Multi-Street-Planung wird wichtig (wie eskalieren wir den Pot ueber 3 Streets?).
- Strategie: Selektiver. Position und Board-Texture werden entscheidender.

**Hoher SPR (8-15+):**
- Nur die staerksten Haende koennen den gesamten Stack gewinnen.
- Overpairs koennen in Schwierigkeiten geraten (Set over Overpair Szenarien).
- Draws haben exzellente Implied Odds.
- Speculative Haende (kleine Pocket Pairs, Suited Connectors) gewinnen an Wert.
- Strategie: Komplex. Pot-Control mit mittleren Haenden. Aggressiv mit Nuts und Draws.
- Typisch in: Single-Raised-Pots, Deep-Stack-Spielen.

**Wann am wichtigsten:** VOR jeder Postflop-Entscheidung. SPR bestimmt die gesamte Handplanung.

### 5.2 Effektive Stack Sizes

**Was es ist:** Der kleinere der beiden relevanten Stacks. Wenn wir 150BB haben und der Gegner 80BB, ist die effektive Stack Size 80BB (wir koennen maximal 80BB verlieren/gewinnen).

**Wie extrahieren:** min(unser_stack, gegner_stack).

**In Multiway-Pots:** Die effektive Stack Size ist nicht einheitlich. Wir haben mit JEDEM Gegner eine separate effektive Stack Size. Gegen den Short Stack spielen wir "Short Stack Poker", gegen den Deep Stack "Deep Stack Poker" — gleichzeitig.

**Auswirkungen auf Preflop:**
- **20-30BB (Short Stack):** Push-or-Fold-Strategie. Komplexe Postflop-Strategien werden irrelevant. Shoving-Charts nutzen.
- **40-60BB (Medium Stack):** 3-Bet/Fold wird haeufiger als 3-Bet/Call. Weniger Speculative Calls.
- **80-100BB (Standard Stack):** Vollstaendige Strategie. Alle Optionen verfuegbar.
- **150BB+ (Deep Stack):** Speculative Haende gewinnen enorm. Suited Connectors und kleine Pairs werden profitabler. Implied Odds werden dominant.

### 5.3 Pot Odds

**Was es ist:** Das Verhaeltnis zwischen dem Betrag den wir callen muessen und dem gesamten Pot (inklusive der Bet des Gegners).

**Formel:** Pot Odds = Call-Betrag / (Pot + Bet des Gegners + Call-Betrag)

**Beispiel:** Pot ist 100, Gegner bettet 50, wir muessen 50 callen.
Pot Odds = 50 / (100 + 50 + 50) = 50/200 = 25%

**Bedeutung:** Wir brauchen mindestens 25% Equity gegen den Range des Gegners, um profitabel zu callen.

**Quick-Reference-Tabelle:**
| Bet-Groesse (% Pot) | Pot Odds | Min. Equity zum Call |
|---------------------|----------|---------------------|
| 25% | 16.7% | 16.7% |
| 33% | 20% | 20% |
| 50% | 25% | 25% |
| 66% | 28.5% | 28.5% |
| 75% | 30% | 30% |
| 100% (Pot) | 33.3% | 33.3% |
| 150% | 37.5% | 37.5% |
| 200% (2x Pot) | 40% | 40% |

**Einfluss auf Entscheidung:** Wenn unsere geschaetzte Equity >= Pot Odds → Call ist profitabel. Wenn nicht → Fold (oder Raise als Bluff).

### 5.4 Implied Odds

**Was es ist:** Die erwarteten ZUSAETZLICHEN Gewinne in spaeteren Betting-Rounds wenn wir unsere Hand verbessern.

**Formel:** Effektive Odds = Call-Betrag / (Pot + Bet + erwartete zukuenftige Gewinne)

**Wann sind Implied Odds hoch?**
- Gegner hat einen starken Range und wird wahrscheinlich weiteren Bets callen (z.B. er hat Overpair, wir haben Set-Draw).
- Der Stack ist tief relativ zum Pot (hoher SPR).
- Unsere Hand ist "versteckt" (der Gegner erkennt unsere Staerke nicht, z.B. Bottom Set).
- Wir haben den Nut-Draw (wenn wir treffen, haben wir die Nuts und koennen maximal extrahieren).

**Wann sind Implied Odds niedrig?**
- Gegner ist tight und foldet bei Gefahr.
- Board wird offensichtlich gefaehrlich wenn unser Draw ankommt (z.B. dritte Flush-Karte — Gegner sieht die Gefahr).
- Stacks sind kurz (wenig zusaetzliches Geld zu gewinnen).
- Unsere Hand ist "offensichtlich" (z.B. offene Straight-Karte kommt — jeder sieht es).

**Einfluss auf Entscheidung:** Set-Mining (kleine Pairs callen um ein Set zu floppen) braucht ~15:1 Implied Odds um profitabel zu sein (wir floppen nur ~11.8% ein Set). D.h. wenn wir 3BB preflop callen, muessen wir erwarten ~45BB zu gewinnen wenn wir das Set floppen.

### 5.5 Commitment Threshold

**Was es ist:** Der Punkt, an dem wir so viel in den Pot investiert haben, dass ein Fold mathematisch falsch wird.

**Faustregel:** Wenn wir mehr als ~33% unseres Stacks investiert haben, sind wir oft "pot-committed" mit Top-Pair+-Haenden.

**SPR-basierte Commitments:**
- SPR < 2: Committed mit jedem Pair.
- SPR 2-4: Committed mit Top Pair Top Kicker+.
- SPR 4-8: Committed mit Overpair+ oder starkem Top Pair.
- SPR 8+: Committed nur mit Set+.

**Einfluss auf Entscheidung:** BEVOR wir eine Bet machen oder callen, pruefen: "Committed mich diese Aktion?" Wenn ja, muessen wir bereit sein, All-in zu gehen. Wenn wir nicht bereit sind All-in zu gehen, sollten wir die Aktion nicht machen.

### 5.6 Pot-Geometrie (Pot-Aufbau ueber mehrere Streets)

**Was es ist:** Wie gross der Pot am River wird, basierend auf Bet-Sizing auf jeder Street.

**Geometrische Kalkulation:**
Starttopf: P
- Flop Bet: B1 (z.B. 66% Pot) → Pot wird P + 2*B1 = P + 2*(0.66P) = 2.32P
- Turn Bet: B2 (z.B. 75% Pot) → Pot wird 2.32P + 2*(0.75*2.32P) = 2.32P + 3.48P = 5.8P
- River Bet: B3 (z.B. 100% Pot) → Pot wird 5.8P + 2*5.8P = 17.4P

**Bedeutung:** Eine "kleine" Bet-Groesse auf dem Flop kann am River zu einem riesigen Pot fuehren, wenn sie auf jeder Street wiederholt wird. Bet-Sizing-Entscheidungen am Flop sind eigentlich River-Entscheidungen.

**Einfluss auf Entscheidung:**
- **Reverse Engineering:** Vom River rueckwaerts planen. "Wie gross will ich den Pot am River haben?" → Daraus das Flop-Sizing ableiten.
- **Pot-Building:** Mit starken Haenden auf jeder Street so betten, dass am River genug fuer einen All-in-Shove im Pot ist.
- **Pot-Control:** Mit mittleren Haenden auf einer Street checken (meistens Turn), um den Pot manageable zu halten.

---

## 6. PLAYER PROFILING (Spieler-Profilierung)

### 6.1 VPIP (Voluntarily Put Money in Pot)

**Was es ist:** Prozentsatz der Haende, bei denen ein Spieler freiwillig Geld in den Pot investiert (Call oder Raise preflop, NICHT Blinds).

**Wie extrahieren:** Anzahl Haende mit freiwilliger Action / Gesamthaende.

**Interpretation:**
- **<15% (Ultra-Tight/Nit):** Spielt nur Premium-Haende. Wenn er bettet, hat er fast immer etwas Starkes. Easy fold gegen seine Aggression mit allem unter TPTK.
- **15-22% (Tight/TAG):** Solider Spieler. Guter Opening Range. Respektabel.
- **22-30% (Loose/LAG):** Breiter Range. Kann viele Haende haben. Schwerer zu lesen, aber auch mehr Fehler in seinen Range-Konstruktionen.
- **>30% (Very Loose/Fish):** Spielt zu viele Haende. Hat oft marginale Holdings. Value-Bet dicker und oefter. Nicht bluffen (er callt mit allem).
- **>50% (Maniac/Extremer Fish):** Spielt fast alles. Maximale Value-Extraktion anstreben. Pot-Control mit mittleren Haenden.

### 6.2 PFR (Preflop Raise)

**Was es ist:** Prozentsatz der Haende, bei denen ein Spieler preflop raised (Open-Raise oder 3-Bet).

**Wie extrahieren:** Anzahl Haende mit preflop Raise / Gesamthaende.

**Interpretation:**
- **VPIP >> PFR (z.B. VPIP 40, PFR 8):** Passiver Spieler. Callt viel, raised wenig. Typischer Recreation Player. Wenn er raised, ist es ernst.
- **VPIP ~ PFR (z.B. VPIP 22, PFR 19):** Aggressiver Spieler. Raised fast immer statt zu callen. Respektabel.
- **VPIP - PFR > 10:** "Calling Station" Tendenz. Viel Geld durch Thin Value-Bets zu verdienen.

### 6.3 Aggression Factor (AF)

**Was es ist:** (Bets + Raises) / Calls. Misst Postflop-Aggression.

**Interpretation:**
- **AF < 1.5:** Passiv. Bettet/raised selten. Wenn er bettet, hat er was. Wenn er callt, hat er einen Draw oder schwache Made Hand.
- **AF 1.5-3:** Standard-aggressiv. Ausgewogenes Spiel.
- **AF > 3:** Sehr aggressiv. Bettet und raised haeufig. Kann viele Bluffs enthalten. Oefter Call-Down mit mittleren Haenden.
- **AF > 5:** Maniac-Tendenzen. Blufft exzessiv. Trap mit starken Haenden, Call-Down mit mittleren Haenden.

### 6.4 WTSD (Went to Showdown)

**Was es ist:** Prozentsatz der Haende (die den Flop sehen), bei denen der Spieler zum Showdown geht.

**Interpretation:**
- **<24% (Low WTSD):** Gibt oft auf. Zu viele Folds auf spaeten Streets. Multi-Street-Bluffs profitabel.
- **24-30% (Standard):** Ausgewogenes Spiel.
- **>30% (High WTSD):** "Showdown-Monkey" / Calling Station. Callt zu oft bis zum Showdown. Bluffs sind wertlos. Nur fuer Value betten. Thin Value-Bets werden extrem profitabel.

### 6.5 Spielertyp-Profile

**Nit (Ultra-Tight Passive):**
- VPIP <15, PFR <12, AF 1-2, Fold to C-Bet >70%
- **Strategie gegen Nit:** Viel stealen (er foldet zu oft). Auf seine Aggression sofort aufgeben (er hat immer was). 3-Betten als Bluff (er foldet 70%+ preflop). NICHT trappen (er gibt keinen weiteren Chip rein).

**TAG (Tight Aggressive):**
- VPIP 18-24, PFR 16-22, AF 2-3
- **Strategie gegen TAG:** Standard-Poker spielen. Schwer zu exploiten. Position wird entscheidend. Auf seine Bluffs vorbereitet sein. In Position floaten.

**LAG (Loose Aggressive):**
- VPIP 25-35, PFR 22-30, AF 3-5
- **Strategie gegen LAG:** Breitere Value-Ranges. Weniger folden (er blufft oefter). Mehr Check-Calls statt Check-Raises (seine Bluffs kommen in die Calling-Range). In Position 3-Betten mit breiteren Ranges.

**Fish/Recreational (Loose Passive):**
- VPIP >35, PFR <15, AF <1.5, WTSD >30%
- **Strategie gegen Fish:** NIE bluffen. Thick Value-Bets auf allen Streets. Pot-Groesse maximieren mit starken Haenden. Thin Value-Betten (er callt mit Bottom Pair). Keine fancy Plays — A-B-C-Poker druckt Geld.

**Maniac (Loose Hyper-Aggressive):**
- VPIP >35, PFR >25, AF >4
- **Strategie gegen Maniac:** Trappen mit starken Haenden (er blufft in unsere Checks). Breitere Call-Down Ranges. Pot-Control aufgeben — er eskaliert den Pot fuer uns. Position ist LEBENSWICHTIG gegen Maniacs.

### 6.6 Exploitative Adjustments pro Spot

**Gegen Spieler der zu oft foldet:**
- Haeufiger bluffen auf allen Streets
- Kleinere Bluff-Sizings (weniger Risiko, gleiche Fold-Equity)
- Oefter 3-Betten light
- Oefter C-Betten (auch ohne Hand)
- Multi-Barrel mit mehr Bluffs

**Gegen Spieler der zu oft callt:**
- NIE bluffen
- Duennere Value-Bets (er callt mit Worse)
- Groessere Value-Bet-Sizings (er callt trotzdem)
- Keine Fancy Plays
- Top Pair mit jedem Kicker value-betten
- Am River mit Second Pair value-betten

**Gegen Spieler der zu aggressiv ist:**
- Mehr Check-Calls (lass ihn in deine starken Haende bluffen)
- Slow-Play haeufiger (er baut den Pot fuer dich)
- Weniger Check-Raises (er bet-folds nicht, er bettet durch)
- Breitere Call-Down Ranges
- Trap, Trap, Trap

**Gegen Spieler der zu passiv ist:**
- Mehr Value-Betten (er check-callt statt zu betten)
- Weniger Slow-Play (er baut den Pot nicht fuer dich)
- Pot-Control mit mittleren Haenden (er ueberrascht nicht mit Raises)
- Bluffs werden profitabel wenn er auch passiv foldet
- Free Cards nehmen wenn moeglich

---

## 7. GAME FLOW & META-INFORMATION

### 7.1 Tilt-Erkennung

**Was es ist:** Emotionaler Zustand eines Spielers der zu suboptimalen Entscheidungen fuehrt.

**Tilt-Indikatoren:**
- **Kuerzlich grossen Pot verloren** (groesster Indikator)
- **Bet-Sizing-Veraenderung:** Ploetzlich groesser oder kleiner als normal
- **Timing-Veraenderung:** Ploetzlich schnellere oder langsamere Entscheidungen
- **VPIP-Anstieg:** Ploetzlich mehr Haende spielen
- **Aggression-Anstieg:** Ploetzlich mehr Bets und Raises
- **Ungewoehnliche Plays:** Donk-Bets, Overbets, seltsame Lines die vorher nicht gezeigt wurden
- **Chat-Verhalten (bei Online):** Beschwerden, frustrierte Kommentare

**Wie extrahieren:** 
- Letzte 5-10 Haende analysieren: Gab es einen signifikanten Verlust?
- VPIP/PFR der letzten 10 Haende mit Gesamtdurchschnitt vergleichen
- Bet-Sizing-Varianz pruefen

**Einfluss auf Entscheidung:**
- Gegen Tilting-Spieler: BREITERE Value-Ranges. Er callt mit schlechteren Haenden.
- Weniger folden auf seine Aggression (er blufft oefter aus Frust).
- Groessere Pots anstreben (er macht groessere Fehler).
- NICHT provozieren — Tilt aufrechterhalten, nicht verstaerken.

**Wann am wichtigsten:** Sofort nach einem Bad Beat oder einem verlorenen grossen Pot. Die naechsten 3-5 Haende sind die profitabelsten gegen einen Tilt-Spieler.

### 7.2 Stack-Momentum

**Was es ist:** Ob ein Spieler gewinnt oder verliert und wie sich das auf sein Spiel auswirkt.

**Winning Momentum:**
- Stack ist groesser als Buy-in
- Psychologischer Effekt: Spieler wird oft TIGHTER (will Gewinne schuetzen) oder LOOSER (fuehlt sich unbesiegbar)
- Tracking: Stack-Groesse vs Buy-in ueber Zeit

**Losing Momentum:**
- Stack ist kleiner als Buy-in
- Psychologischer Effekt: Oft Tilt, aber manche Spieler werden TIGHTER (Angst vor weiteren Verlusten)
- Desperate Plays: Short-Stack-Shoves, uebertriebene Bluffs

**Einfluss auf Entscheidung:** 
- Spieler der 3x aufgebaut hat: Vorsicht, spielt wahrscheinlich gut oder hat Glueck. Respektieren.
- Spieler der 2x nachgekauft hat: Wahrscheinlich tilted. Exploiten.
- Spieler der gerade einen grossen Pot gewonnen hat: Kann in den naechsten Haenden "entspannter" spielen (Euphorie-Looseness).

### 7.3 Table Dynamics

**Was es ist:** Die Gesamtatmosphaere am Tisch — wer dominiert, wer Angst hat, wer aggressiv ist.

**Faktoren:**
- **Wer hat den groessten Stack?** Der Big Stack kann Druck ausueben.
- **Gibt es einen dominanten Aggressor?** Wenn ja, passen sich die anderen Spieler an (werden passiver).
- **Wie viele Recreational Players sind am Tisch?** → Tisch-Qualitaet. Mehr Fish = mehr Value-Opportunities.
- **Tisch-Atmosphaere:** Ist der Tisch "action" (viel Action, grosse Pots) oder "nitty" (wenig Action, kleine Pots)?

**Einfluss auf Entscheidung:**
- An "nitty" Tischen: Aggression wird extrem profitabel (alle folden zu viel).
- An "action" Tischen: Tight spielen wird profitabel (mit starken Haenden in die Action kommen).
- Wenn ein Maniac am Tisch ist: Position zum Maniac ist kritisch (direkt links vom Maniac sitzen = optimal, weil wir NACH ihm handeln).

### 7.4 Multiway vs Heads-Up Dynamiken

**Heads-Up (2 Spieler):**
- Breitere Ranges. Bluffs sind profitabler (nur ein Spieler muss folden).
- Top Pair ist eine starke Hand.
- Aggression ist der Schluessel.
- Position dominiert.

**Multiway (3+ Spieler):**
- Engere Ranges. Bluffs werden DEUTLICH schlechter (mehrere Spieler muessen folden).
- Top Pair ohne Kicker ist verwundbar (jemand hat wahrscheinlich besser).
- Value-Betten wird wichtiger als Bluffen.
- Position verliert etwas an Bedeutung (der Pot ist groesser, Odds sind besser zum Callen).
- **Key Rule:** In Multiway-Pots: Fast nie bluffen. Nur mit genuiner Staerke betten. Die Fold-Equity gegen ALLE Spieler gleichzeitig ist zu niedrig.
- **Nut-Advantage wird kritischer:** In Multiway-Pots gewinnt die Nuts fast immer. Mittelmaessige Haende verlieren enorm an Wert.

### 7.5 Showdown-Daten

**Was es ist:** Haende die der Gegner am Showdown gezeigt hat — die wertvollste Information ueberhaupt.

**Wie extrahieren:** Alle Showdown-Haende pro Spieler tracken und speichern.

**Was sie verraten:**
- **Welche Haende spielte er von welcher Position?** → Preflop-Range rekonstruieren.
- **Mit welcher Hand hat er so gespielt?** → Lines zuordnen. "Er hat am Flop gecheckt und am Turn ge-check-raised — und er hatte ein Set. Also macht er das mit Sets."
- **Was hat er als Bluff gezeigt?** → Bluff-Range identifizieren.
- **Was hat er als Value-Bet gezeigt?** → Thin Value vs Thick Value erkennen.
- **Showdown ohne Bet (checked through):** Was checked er runter? Zeigt seine Definition von "zu schwach zum Betten" und "stark genug zum Callen."

**Einfluss auf Entscheidung:** Jeder Showdown ist ein Datenpunkt. Nach 3-5 Showdowns koennen wir anfangen, den Spielertyp und spezifische Tendenzen zu identifizieren. Nach 20+ Showdowns haben wir ein detailliertes Profil.

---

## 8. PREFLOP RANGE CONSTRUCTION (Preflop-Range-Aufbau)

### 8.1 Open-Raise Ranges by Position (6-Max Standard, 100BB)

**UTG (~15-17% = ~200 Combos):**
- Pairs: 22+
- Suited: A2s+, K9s+, Q9s+, J9s+, T9s, 98s, 87s, 76s, 65s
- Offsuit: ATo+, KJo+, QJo
- **Key Insight:** Wenn ein UTG-Spieler opened, hat er ein sehr enges Range. Top Pair gegen UTG ist weniger wert als Top Pair gegen BTN.

**HJ (~18-22% = ~260 Combos):**
- Alles von UTG + K8s, Q8s+, J8s+, T8s, A9o, KTo+

**CO (~25-30% = ~370 Combos):**
- Alles von HJ + K5s+, Q7s+, J7s+, T7s+, 97s+, 86s+, 75s+, 64s+, 54s, A7o+, K9o+, QTo+, JTo

**BTN (~40-50% = ~550+ Combos):**
- Sehr breit. Fast alle Pocket Pairs, die meisten Suited Hands, viele Offsuit Broadways, suited gappers.
- **Key Insight:** BTN-Opens muessen aggressiver verteidigt werden — sie haben so viele schwache Haende in ihrem Range.

**SB (~35-45% als Open, oder Limp-Strategie):**
- Manche Spieler raisen breit, manche limpen. SB-Strategie ist sehr spielerabhaengig.
- GTO-Empfehlung: Raise-or-Fold (kein Limp) gegen alle ausser BB.

**BB Defense (vs verschiedene Positionen):**
- Vs UTG Open: ~25-30% Defense
- Vs HJ Open: ~30-35% Defense
- Vs CO Open: ~35-45% Defense
- Vs BTN Open: ~50-65% Defense (breite Defense wegen gutem Preis)
- Vs SB Open: ~55-70% Defense
- **Key Insight:** BB-Ranges sind die breitesten Postflop-Ranges. Ein BB-Caller kann buchstaeblich ALLES haben (inklusive 72o auf manchen Sizings).

### 8.2 3-Bet Ranges by Position

**Aus dem BB vs BTN Open (breiteste 3-Bet-Range):**
- Value: QQ+, AK, AQs
- Bluffs: A2s-A5s (Blocker + Suited + Wheel Potential), K9s-KTs, Q9s-QTs, einige Suited Connectors
- Frequenz: ~10-14% des gesamten BB-Ranges

**Aus dem SB vs BTN Open:**
- Aehnlich breit wie BB. SB sollte HAEUFIG 3-betten (weil Flat-Calling aus SB OOP ohne Discount schlecht ist).
- Frequenz: ~12-18%

**Aus Spaeter Position vs Frueher Position:**
- Enger. Weniger Bluffs. Mehr "nussige" Haende.
- CO vs UTG: QQ+, AKs (Value), A5s-A4s (Bluffs). Sehr eng.

**Cold 4-Bet Ranges:**
- Gegen 3-Bets: Deutlich enger. Typisch: KK+, AKs (Value), A5s, A4s (Bluffs).
- Gegen aggressive 3-Bettors: Etwas breiter. QQ+, AK, AQs (Value), mehr Suited Aces (Bluffs).

### 8.3 Cold-Call Ranges

**Was Cold-Caller typischerweise haben:**
- Mittlere Pocket Pairs: 77-TT (zu gut zum Folden, nicht gut genug zum 3-Betten gegen viele Ranges)
- Suited Broadway: AJs, ATs, KQs, KJs (gute Haende die OOP nicht 3-betten wollen weil 4-Bet-Gefahr)
- Suited Connectors: 87s, 98s, T9s (spielen gut Multiway und haben gute Implied Odds)

**Key Insight fuer Range-Reading:** Wenn jemand cold-callt statt zu 3-betten, hat er NICHT AA-QQ oder AK (wuerde 3-betten). Das ist eine massive Range-Einschraenkung die am Flop hilft.

### 8.4 Squeeze Ranges

**Was es ist:** 3-Bet nachdem jemand opened UND jemand gecallt hat.

**Vorteile des Squeezes:**
- Mehr "totes" Geld im Pot (Caller hat schon Geld investiert)
- Der Caller hat einen gecappten Range (keine Premiums, sonst haette er 3-bettet)
- Oft folden beide (Opener hat manchmal eine schwache Open-Hand, Caller hat per Definition keine starke Hand)

**Squeeze-Range:**
- Value: QQ+, AK
- Bluffs: A2s-A5s, K9s-KTs, kleine Suited Connectors
- Groesseres Sizing als Standard-3-Bet (z.B. 4x statt 3x) wegen des zusaetzlichen Callers

### 8.5 Preflop-Range-Interaktion mit Flop-Texturen

**Raiser-Favorable Flops:**
- High-Card Boards (A-K-x, K-Q-x): Raiser hat mehr Broadway-Combos
- Dry Boards (K-7-2r, A-8-3r): Wenige Draws, Raiser hat mehr Overpairs
- Ace-High Boards: Raiser hat alle starken Ax-Combos, Caller hat oft schwaehere Ax

**Caller-Favorable Flops:**
- Low Connected Boards (5-6-7, 4-5-6): Caller hat mehr Suited Connectors und kleine Pairs
- Middling Boards (8-9-T, 7-8-9): Caller hat mehr Two-Pair und Straight-Combos
- Paired Low Boards (5-5-x, 3-3-x): Caller hat mehr kleine Pocket Pairs fuer Sets

**Neutral Flops:**
- Boards die beide Ranges aehnlich treffen (z.B. Q-9-5 mit zwei Tone)

**Einfluss:** Auf Raiser-Favorable Flops: Hohe C-Bet-Frequenz. Auf Caller-Favorable Flops: Niedrigere C-Bet-Frequenz, mehr Checks.

---

## 9. STREET-BY-STREET RANGE NARROWING (Schrittweise Range-Eingrenzung)

### 9.1 Fundamentales Prinzip

**Bayesian Range Updating:**
Mit jeder Aktion aktualisieren wir unsere Schaetzung des Gegner-Ranges. Jede Bet, jeder Call, jeder Check und jeder Fold entfernt Haende aus dem moeglichen Range.

**Prozess:**
1. Start: Preflop-Range basierend auf Position und Action
2. Flop-Action: Range filtern (was bettet er? was checkt er? was callt er? was foldet er?)
3. Turn-Action: Weiter filtern
4. River-Action: Finaler Range — oft nur noch 10-30 Combos uebrig

### 9.2 Preflop-Aktion → Range-Eingrenzung

**Open-Raise von UTG:**
- Eliminiert: Alle Trash-Haende, die meisten suited Gappers, schwache Offsuit-Haende
- Uebrig: ~200 Combos (Top 15%)

**3-Bet:**
- Eliminiert: Alle "Flat-Call"-Haende (mittlere Pairs, suited Broadways die nicht 3-betten)
- Uebrig: ~80-120 Combos — Premiums + Bluffs (bimodal Range)

**4-Bet:**
- Eliminiert: Fast alles ausser QQ+, AKs (Value) und AXs (Bluffs)
- Uebrig: ~30-50 Combos

**5-Bet (All-In preflop bei 100BB):**
- Eliminiert: Alle Bluffs in den meisten Szenarien
- Uebrig: AA, KK (manchmal QQ, AKs)

### 9.3 Flop-Aktion → Range-Eingrenzung

**Gegner bettet (C-Bet):**
Was bleibt im Range:
- Value-Haende: Top Pair+, Overpairs, Sets, Two Pair
- Semi-Bluffs: Flush Draws, Straight Draws, Combo Draws
- Pure Bluffs: Overcards, Backdoor Draws, Air
Was wird ELIMINIERT:
- Haende die "zu gut zum Bluffen, zu schlecht zum Value-Betten" sind? → Nein, die werden eigentlich gecheckt.
- Haende die "zu schwach zum Bluffen" sind? → Ja, die folden.
Fazit: C-Bet-Range ist polarisiert — starke Haende UND Bluffs, weniger Mittelstaerke.

**Gegner checkt (no C-Bet):**
Was bleibt im Range:
- Schwache Made Hands: Middle Pair, Bottom Pair, Ace High
- Give-Ups: Komplett verfehlte Haende
- Traps: Gelegentlich starke Haende (Sets, Two Pair) — ABER selten
Was wird ELIMINIERT:
- Die meisten starken Haende (wuerden C-Betten)
- Die meisten guten Draws (wuerden Semi-Bluff C-Betten)
Fazit: Check-Range ist GECAPPT — hauptsaechlich mittelstarke bis schwache Haende.

**Gegner callt C-Bet:**
Was bleibt im Range:
- Made Hands: Top Pair (oft mit schwachem Kicker), Middle Pair, Overpair (manchmal Slow-Play)
- Draws: Flush Draws, Straight Draws, Gutshots mit Overcards
- Slow-Plays: Sets, Two Pair (seltener — viele Spieler wuerden raisen)
Was wird ELIMINIERT:
- Pure Air (wuerde folden)
- Sehr starke Haende (viele wuerden raisen, nicht callen)
Fazit: Call-Range besteht hauptsaechlich aus "mittelstarken" Haenden und Draws.

**Gegner raised (Check-Raise oder Raise auf C-Bet):**
Was bleibt im Range:
- Starke Value: Sets, Two Pair, Top Pair Top Kicker
- Semi-Bluffs: Starke Draws (Flush Draw + Pair, Combo Draw, OESD mit Overcards)
- Pure Bluffs: Gelegentlich — aber spielerabhaengig
Was wird ELIMINIERT:
- Alle schwachen Haende (wuerden folden)
- Alle mittelstarken Haende (wuerden callen, nicht raisen)
Fazit: Raise-Range ist hoch polarisiert — sehr stark oder semi-bluff.

### 9.4 Turn-Aktion → Weitere Eingrenzung

**Gegner bettet Turn nach Flop-Bet (Double Barrel):**
- Range wird enger. Viele Flop-Bluffs geben am Turn auf.
- Uebrig: Starke Value (bestaetigte Haende) + verbleibende Draws + hartnaeckige Bluffs
- KEY INSIGHT: Am Turn eliminierte Bluffs machen etwa 30-50% der Flop-Bluffs aus. Der Turn-Range ist also staerker als der Flop-Range.

**Gegner checkt Turn nach Flop-Bet:**
- Deutliches Schwaeche-Signal. Hat am Flop noch gebettet, jetzt nicht mehr.
- Moeglich: Draw der am Turn nicht angekommen ist. Mittlere Made Hand die Pot Control will.
- Selten: Monster-Slow-Play (haette am Turn weitergebettet um den Pot aufzubauen).
- **Exploitation:** River-Bluff wird sehr profitabel. Sein Range ist gecappt.

**Gegner callt Turn-Bet:**
- Range wird noch enger als nach Flop-Call.
- Uebrig: Genuines Value (mindestens Top Pair mit OK Kicker), starke Draws (muessen Odds haben)
- Eliminiert: Alle Haende die am Flop "spekulativ" gecallt haben und am Turn nicht verbessert haben.

**Gegner raised Turn:**
- EXTREM stark. Turn-Raise ist einer der staerksten Tells im Poker.
- Bei den meisten Spielern: Set+ oder Nut Draw.
- Bluffing am Turn ist selten (nur noch eine Karte kommt, wenig Sinn einen Draw zu semi-bluffen wenn man die Odds zum Callen hat).
- **Response:** Nur mit Nuts+ callen oder 3-betten. Fast alles andere folden.

### 9.5 River-Aktion → Finaler Range

**Gegner bettet River (Triple Barrel):**
- Hoch polarisiert: Nuts oder Air. KEINE mittleren Haende.
- Combo-Count: Wie viele Value-Combos hat er? Wie viele Bluff-Combos?
- GTO-Ratio: Bei Pot-Bet sollte ca. 1 Bluff pro 2 Value-Combos enthalten sein.

**Gegner checkt River:**
- Gibt Showdown Value auf oder gibt auf.
- Hat definitiv nicht die Nuts (wuerde betten).
- Unsere Bluffs werden profitabel WENN er auch schwache Haende foldet.
- Unsere Thin Value-Bets werden profitabel WENN er mit schlechteren Haenden callt.

**Gegner callt River-Bet:**
- Zeigt eine "Bluff-Catcher" Hand — stark genug zum Callen, nicht stark genug zum Raisen.
- Typisch: Top Pair, Overpair, gelegentlich Second Pair.
- Showdown-Information! Wenn er zeigen muss, lernen wir viel.

**Gegner raised River:**
- Bei 95% der Spieler auf Low/Mid-Stakes: DIE NUTS. Oder sehr nah an den Nuts.
- River-Raise-Bluffs existieren, sind aber extrem selten bei den meisten Spielern.
- **Response:** Ohne die Nuts folden. Mit den Nuts callen oder re-raisen.

### 9.6 Equity Realization

**Was es ist:** Der Prozentsatz unserer theoretischen Equity den wir tatsaechlich "realisieren" (in Gewinn umwandeln).

**Faktoren die Equity-Realisierung beeinflussen:**
- **Position:** IP realisiert ~5-10% mehr Equity als OOP.
- **Playability der Hand:** Suited Connectors realisieren mehr Equity als Offsuit Disconnected Haende (sie treffen mehr Boards).
- **Stack Depth:** Deep Stacks erhoehen Equity-Realisierung fuer speculative Haende.
- **Skill-Advantage:** Bessere Spieler realisieren mehr ihrer Equity.

**Beispiel:** 76s hat ~42% Equity gegen AKo (preflop). Aber:
- IP realisiert ~38% (nahe der Raw Equity)
- OOP realisiert nur ~32% (deutlich unter Raw Equity)
- Das bedeutet: 76s ist IP ein profitabler Call, OOP oft ein Fold — obwohl die Raw Equity identisch ist.

**Einfluss auf Entscheidung:** Nicht nur "Habe ich genug Equity?" fragen, sondern "Kann ich diese Equity auch realisieren?"

---

## 10. MATHEMATICAL CONCEPTS (Mathematische Konzepte)

### 10.1 Expected Value (EV)

**Was es ist:** Der durchschnittliche langfristige Gewinn oder Verlust einer Entscheidung.

**Formel:** EV = (Wahrscheinlichkeit zu gewinnen * Gewinnbetrag) - (Wahrscheinlichkeit zu verlieren * Verlustbetrag)

**Beispiel (einfacher Call):**
Pot: 100, Gegner bettet 50, wir muessen 50 callen.
Wir schaetzen 40% Chance zu gewinnen.
EV = (0.40 * 200) - (0.60 * 50) = 80 - 30 = +50. Call ist +EV.

**Beispiel (Bluff):**
Pot: 100, wir betten 75 als Bluff.
Wir schaetzen 50% Fold-Equity.
EV = (0.50 * 100) - (0.50 * 75) = 50 - 37.5 = +12.5. Bluff ist +EV.

**Einfluss auf Entscheidung:** Jede Aktion hat einen EV. Wir waehlen IMMER die Aktion mit dem hoechsten EV (oder dem am wenigsten negativen EV wenn alle Optionen schlecht sind).

**Wann am wichtigsten:** Bei JEDER Entscheidung. Aber besonders bei grossen Pot-Entscheidungen, wo der Unterschied zwischen +EV und -EV hunderte BBs betragen kann.

### 10.2 Fold Equity

**Was es ist:** Die Wahrscheinlichkeit, dass der Gegner auf unsere Bet/Raise foldet.

**Wie schaetzen:**
- Basierend auf Spielertyp (Fish foldet selten, Nit foldet oft)
- Basierend auf Spot (River-Bluffs generieren mehr Fold Equity als Flop-Bluffs)
- Basierend auf unserer Bet-Sizing (groessere Bets = mehr Fold Equity)
- Basierend auf Board-Texture (Scare Cards erhoehen Fold Equity)
- Basierend auf Geschichte der Hand (viel Aggression vorher = weniger Fold Equity)

**Formel fuer Break-Even Bluff:**
Required Fold Equity = Bet / (Pot + Bet)
z.B. Pot 100, Bet 75: 75 / (100+75) = 42.9%. Gegner muss >42.9% folden damit unser Bluff profitabel ist.

**Einfluss auf Entscheidung:** Bluffs sind nur profitabel wenn die geschaetzte Fold Equity > Break-Even-Percentage ist.

### 10.3 Break-Even Percentage

**Was es ist:** Der Mindestprozentsatz, den wir gewinnen/zum Folden bringen muessen, damit eine Aktion neutral (EV=0) ist.

**Fuer Calls:** Break-Even% = Call / (Pot + Opponent Bet + Call) = Pot Odds
**Fuer Bluffs:** Break-Even% = Bluff Bet / (Pot + Bluff Bet)

**Quick-Reference fuer Bluffs:**
| Bluff-Groesse | Break-Even Fold% |
|---------------|-----------------|
| 33% Pot | 25% |
| 50% Pot | 33% |
| 66% Pot | 40% |
| 75% Pot | 43% |
| 100% Pot | 50% |
| 150% Pot | 60% |

### 10.4 Minimum Defense Frequency (MDF)

**Was es ist:** Der Mindestprozentsatz unseres Ranges den wir gegen eine Bet verteidigen muessen (Call oder Raise), damit der Gegner nicht profitabel mit jedem Bluff betten kann.

**Formel:** MDF = Pot / (Pot + Bet)

**Beispiel:** Pot 100, Gegner bettet 75.
MDF = 100 / (100+75) = 57.1%. Wir muessen mindestens 57.1% unseres Ranges verteidigen.

**Quick-Reference:**
| Bet-Groesse | MDF |
|-------------|-----|
| 25% Pot | 80% |
| 33% Pot | 75% |
| 50% Pot | 66.7% |
| 66% Pot | 60% |
| 75% Pot | 57.1% |
| 100% Pot | 50% |
| 150% Pot | 40% |
| 200% Pot | 33% |

**Einfluss auf Entscheidung:** Wenn wir zu oft folden, kann der Gegner uns mit jedem Bluff ausbeuten. MDF hilft uns, die richtige Call/Fold-Grenze zu finden. ABER: MDF ist ein GTO-Konzept. Gegen spezifische Spieler koennen wir abweichen:
- Gegen Spieler der nie blufft: MEHR folden als MDF
- Gegen Spieler der zu viel blufft: WENIGER folden als MDF

### 10.5 GTO-Konzepte vereinfacht

**Was GTO ist:** Game Theory Optimal — eine Strategie die NICHT ausgebeutet werden kann. Egal was der Gegner macht, wir verlieren nicht.

**Wann GTO spielen:**
- Gegen unbekannte Gegner (kein Read)
- Gegen starke Regulars (die unsere Exploits bestrafen wuerden)
- Als Ausgangspunkt, von dem wir exploitativ abweichen

**Wann NICHT GTO spielen:**
- Gegen schwache Spieler mit klaren Tendenzen (GTO laesst Geld liegen)
- Wenn wir starke Reads haben (Exploitation ist profitabler)

**Core GTO-Prinzipien:**
1. **Indifferenz:** Der Gegner sollte "indifferent" sein — egal ob er callt oder foldet, sein EV ist gleich. Wir erreichen das durch die richtige Bluff-zu-Value-Ratio.
2. **Bluff-Ratio:** Bei Pot-Bet: 1 Bluff pro 2 Value-Bets (33% Bluffs). Bei 2/3-Pot: 1 Bluff pro 2.5 Value-Bets (28.5% Bluffs). Bei 1/2-Pot: 1 Bluff pro 3 Value-Bets (25% Bluffs).
3. **Range-Balancing:** Jede Aktion (bet, check, call, raise) sollte einen Mix aus Staerken enthalten, damit der Gegner nicht anhand unserer Aktion unser Range erraten kann.

### 10.6 Risk-Reward-Analyse

**Was es ist:** Der Gesamtueberblick ueber Risiko vs potentiellem Gewinn einer Aktion.

**Komponenten:**
- **Direkter Pot:** Was ist jetzt schon im Pot?
- **Call-Kosten:** Was muessen wir investieren?
- **Equity:** Wie oft gewinnen wir?
- **Implied Odds:** Wie viel koennen wir noch gewinnen?
- **Reverse Implied Odds:** Wie viel koennen wir noch verlieren?
- **Fold Equity:** Kann der Gegner noch folden?
- **Turnier-ICM (falls Turnier):** Veraendert die Mathematik bei Turnier-Bubble-Situationen.

**Zusammenfassung:**
Risk = Was wir verlieren wenn wir falsch liegen
Reward = Was wir gewinnen wenn wir richtig liegen
Decision = Wenn Reward/Risk > 1 → machen. Wenn < 1 → lassen.

---

## ZUSAMMENFASSUNG: INFORMATIONS-HIERARCHIE

Bei jeder Entscheidung sollte die App folgende Informationen priorisiert auswerten:

**Tier 1 (IMMER relevant, SOFORT auswerten):**
1. Eigene Handstaerke (absolut und relativ)
2. Board Texture (wet/dry, connected/disconnected, high/low)
3. Position (IP vs OOP)
4. Pot Odds / Stack-to-Pot-Ratio
5. Effektive Stack Sizes

**Tier 2 (WICHTIG, fuer strategische Tiefe):**
6. Gegner-Aktion auf dieser Street (Bet-Sizing, Timing)
7. Gegner-Aktion auf vorherigen Streets (Line-Reading)
8. Preflop-Range des Gegners (basierend auf Position und Action)
9. Draw-Moeglichkeiten (fuer uns und den Gegner)
10. Blocker-Analyse

**Tier 3 (FORTGESCHRITTEN, fuer optimale Entscheidungen):**
11. Spieler-Profil (VPIP, PFR, AF, WTSD)
12. Exploitative Adjustments
13. MDF / GTO-Ueberlegungen
14. Implied und Reverse Implied Odds
15. Multi-Street-Planung (Pot-Geometrie)

**Tier 4 (META, fuer maximale Edge):**
16. Tilt-Erkennung
17. Showdown-Historie
18. Table Dynamics
19. Stack Momentum
20. Timing Tells

---

Diese Analyse deckt jeden Datenpunkt ab, der waehrend einer Texas Hold'em Hand verfuegbar ist. Fuer die Training App sollte jeder dieser Punkte als auswertbares Signal im Decision Engine implementiert werden, mit konfigurierbarer Gewichtung je nach Spielertyp und Situation.