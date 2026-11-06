/* The numbers. Every one of them comes from timed runs of the same task, done both ways, by the same person on the
   same machine: never an estimate, never a best case. AGENT.md, step 1 says how to measure them.

     time     seconds from the first action to the finished task (the median of your runs)
     clicks   presses on mouse or trackpad (a double-click is two); keystrokes don't count
     tools    every app, site or window the task made you touch, in the order you touched them
     log      optional: the moment of every click in the median run, in seconds. With it, the counters tick exactly
              when the real clicks happened; without it they follow the films, then land on the measured total.

   The placeholders below are NOT measurements. The source line says so until you replace it. */
export default {
  old: {
    time: 214.6,                                    // placeholder: replace with your measured median
    clicks: 58,                                     // placeholder
    tools: ['Dashboard', 'Spreadsheet', 'Email'],   // placeholder
    log: null,
  },
  new: {
    time: null,        // null: the product film's last click is the finish (fine once the film is your measured run)
    clicks: null,      // null: the clicks the product film draws
    tools: null,       // null: just the product (its name from the page)
    log: null,
  },
  fastForward: 6,      // wall-clock seconds the rest of the old way takes once the product is done
  beat: 1.4,           // seconds both lanes hold after the product finishes, before the fast-forward
  lead: 'time',        // the ending's big number: 'time' (time back) or 'clicks' (fewer clicks)
  source: 'Placeholder numbers, not a measurement. Replace them with the median of five timed runs of each way: same task, same person, same machine.',

  // the how strip: the product's three key moves, each a frozen moment of the product film.
  // at: a hook the film clicks ('@run') and `after` seconds past that click, or a time in seconds.
  how: [
    { at: '@report', after: -.05, title: 'It’s already <em>set up</em>', line: 'Who it goes to, what’s in it and when: saved once, there every week.' },
    { at: '@run', after: 2.2, title: 'It pulls the <em>numbers</em>', line: 'No copying between tabs. One press fetches every figure.' },
    { at: '@send', after: .6, title: 'It sends <em>itself</em>', line: 'Straight to the people who read it, in the place they read it.' },
  ],
};
