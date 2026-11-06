/* The MCP film's script. Each conversation is a thread in section.html (.mcp-conv), played in order by
   ../_chat/chat.js: the person's line is typed in place, the tool call runs ("server · tool", its arguments, its
   result streaming in), folds to one line, and the agent answers. section.js strings the conversations together
   (the tabs follow along) and ends on the way to add the server. Pacing per message is on the rows (data-run,
   data-hold, data-read, data-cps: ../_chat/README.md). Check any moment with ?t=12.5; ?record&ratio=16:9|1:1|9:16. */
export default {
  size: [600, 'auto'],       // design px wide; the height follows the screen (data-size="600xauto" on the window)
  sizeTall: [400, 'auto'],   // phones and 9:16
  intro: 0,                  // no band: the first line being typed is the opening
  lead: .9,                  // seconds on the empty transcript before the first key
  between: 1.8,              // seconds each finished conversation stays before the next one
  settle: .6,
  outro: 6,                  // seconds held on the ending (Add the MCP): long, so a recording ends on it
  // extra steps around a row, by its data-tour name (none needed for the placeholder)
  before: {}, after: {},
};
