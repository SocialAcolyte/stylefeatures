# Pick note: sf-loader, 2026-11-03

## The hunt

About 450 candidates across 14 contact sheets: Wikimedia Commons (including the Met, LoC, Rijksmuseum, Polona, Houghton,
Chester Beatty and Freer files mirrored there), the Art Institute of Chicago and the Cleveland Museum of Art open-access
APIs. The Met's own API refused us (403, then 410), so its files came through Commons.

Sheets, all in `tools/engine/jobs/`:

- `loader-hunt-a/hunt/sheet.png`: Utamaro sericulture, charkha, norias, al-Jazari, abacus, cash coins
- `loader-hunt-b/hunt/sheet.png`: Gengzhi tu, Utamaro (LoC), Books of Hours, Kehar Singh, prayer wheels
- `loader-hunt-mus1/sheet.jpg`, `loader-hunt-mus2/sheet.jpg`, `loader-hunt-mus4/sheet.jpg`: AIC and Cleveland. Spinning,
  reeling, beads, spindles, the whole Utamaro and Shunsho sericulture series, and the Cleveland *Sericulture* handscroll
- `loader-hunt-d`, `-e`, `-i` (`hunt/sheet.png`): astrolabes, retes, plates, the Met and Louvre astrolabes
- `loader-hunt-g/hunt/sheet.png`: al-Jazari water-raising and clock folios, Hokusai's *Waterwheel at Onden*,
  Agricola, Ramelli, the bookwheel
- `loader-hunt-j/hunt/sheet.png`: Japanese sericulture prints (LoC, NDL)
- `loader-hunt-k/hunt/sheet.png`: every page of Apian's *Astronomicum Caesareum* (Polona, Houghton, the Met)

Shortlist sheet: `tools/engine/jobs/loader-shortlist.jpg`.

## Shortlist

1. **Apian, the lunar dragon volvelle (Draco), *Astronomicum Caesareum*, Ingolstadt 1540**, hand-coloured woodcut,
   National Library of Poland (Polona) copy, public domain, 8822 × 11649 (used at 3840). **Picked.**
2. Apian, the sky volvelle (star map), same copy. Glorious, but its disc is all small constellation figures, and the
   real silk thread lies loose across it.
3. Apian, the twelve-headed dragon of the nodes (Houghton copy). A curled, browned page at 4031 px.
4. *Sericulture*, Southern Song handscroll after Lou Shou, Cleveland 1977.5, CC0. A girl winding quills at a spoked
   wheel beside a creel of bobbins. Beautiful, but the wheel is about 90 px across in a 25,776 px scan: too small to handle.
5. The same scroll's reeling frame over the cocoon basin. Drawn at an angle, so it can't turn honestly.
6. Kehar Singh, *Weaving and Spinning*, Punjab c. 1860. The charkha is nearly edge-on.
7. Utamaro, *Women Engaged in the Sericulture Industry* No. 9 (reeling). The reel is oblique and half-hidden by the figure.
8. al-Jazari, *Waterwheel worked by donkey power*, Met 1315. Its gears are painted as edge-on lenses, and it's the
   clock's own manuscript again.
9. al-Jazari, water clock with an arch of twelve roundels, Freer 1354. The roundels would have to change colour, which
   means painting them.
10. Islamic astrolabes (Louvre, AIC, Harvard). Turning the rete means inventing the plate under it, and no collection
    photographs the parts apart, face-on, at this quality.
11. Chassignet's copper rete (BnF). A rete with no plate.
12. Yoshifuji, *Ito zukuri* (LoC, 7835 px). The reel is cut by the sheet edge and drawn side-on.

## Why the dragon

- It is a real machine made of paper. Apian coloured, cut and assembled the instruments in his own workshop. On this
  plate one paper disc turns on a pin over the printed mater (the base, with the zodiac). The disc carries the dragon,
  the two tabs CAPVT and CAVDA, rings of year marks and the arched latitude scales. Turning that disc, pixel for pixel,
  is exactly what the book's reader did. Because the disc is a full circle, turning it never uncovers any of the mater.
- It goes round, and it advances in proportion. The dragon's head marks the moon's ascending node, and the nodes regress
  steadily backwards through the zodiac, one full turn in about 18.6 years. A determinate job turns it in proportion
  against the mater's real graduated ring. A job with no value just keeps it going round.
- It is sharp. The woodcut hatching holds at 3840 px (engine inspect: no enlargement), and the hand colour is crisp.
- It can be handled. You can take the disc and turn it, the way the reader set it from the tables.
- One culture, one craft: Renaissance German astronomy and printing, for Charles V.
