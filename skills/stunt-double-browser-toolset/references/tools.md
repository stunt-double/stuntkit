# Tools and results

## Browser use toolset members (`BrowserToolsetExecutor`)

| Member                                                                               | Notes                                                                                                           |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `navigate`                                                                           | A URL, or `"back"` / `"forward"`. A bare word (`"Pricing"`) is refused as not a URL. Returns a `browser_state`. |
| `screenshot`, `zoom`                                                                 | PNG. `zoom` crops a region at the page's own resolution.                                                        |
| `read_page`, `find`, `get_page_text`                                                 | Tree with `ref_N` handles, a ranked search, or plain text, capped at 50,000 characters.                         |
| `left_click`, `right_click`, `middle_click`, `double_click`, `triple_click`, `hover` | By ref (scrolled into view, clicked at its centre) or by coordinate.                                            |
| `mouse_move`, `left_click_drag`, `scroll`, `scroll_to`                               | Coordinates; scrolling in notches of 100px; or a ref scrolled into view.                                        |
| `type`, `key`, `form_input`                                                          | Type into focus; keys in xdotool spelling (`ctrl+a`, `Return`); set a control by ref.                           |
| `wait`                                                                               | Up to 30 seconds.                                                                                               |
| `new_tab`, `list_tabs`, `switch_tab`, `close_tab`                                    | Each returns exactly one `browser_state` block.                                                                 |

Disabled, and say so: `javascript_exec`, `file_upload`, `read_console`, `read_network`. Refused with an alternative: `left_mouse_down`, `left_mouse_up`, `hold_key`, clicks with modifiers.

Options (`BrowserToolsetOptions`): `safety`, `allowPrivateHosts`, `checkNavigation(url) => string | null`, `navigationTimeoutMs`, `screenshotTimeoutMs`.

## Direct tools (`DirectBrowserTools`)

| Tool            | Parameters                                                    | Returns                              |
| --------------- | ------------------------------------------------------------- | ------------------------------------ |
| `navigate`      | `url` (or `"back"` / `"forward"`)                             | Where it landed, and a screenshot    |
| `read_page`     | `filter` (`visible` default, `interactive`, `all`), `ref`     | The tree with refs, capped at 20,000 |
| `find`          | `query`                                                       | Up to 20 matches with refs           |
| `get_page_text` | none                                                          | The page's visible text              |
| `click`         | `ref`, or `x` and `y`                                         | The resulting page, and a screenshot |
| `type`          | `text`, optionally `ref` or `x`/`y` to focus first            | The resulting page, and a screenshot |
| `form_input`    | `ref`, `value` (an option, `"true"` / `"false"`, or text)     | The resulting page, and a screenshot |
| `key`           | `text` (`"Enter"`, `"ctrl+a"`, space-separated for sequences) | The resulting page, and a screenshot |
| `scroll`        | `direction`, `amount` (notches 1 to 10, default 5), target    | The resulting page, and a screenshot |
| `screenshot`    | none                                                          | A screenshot                         |
| `done`          | `message`                                                     | A signal for your loop to end        |

`type` does not press Enter; the model follows with `key`. Options (`DirectBrowserToolsOptions`): `viewport` (required), `safety`, `toolTimeoutMs` (default `TOOL_TIMEOUT_MS`, 45 s), `settleMs`. There is no `allowPrivateHosts` or `checkNavigation` here.

`DirectToolResult` is `{ text, screenshotBase64?, error? }`. `run` never throws: `error` is set, and `text` carries the same message for the model.

## Refs

The page script tags each reported element with `data-sd-ref`. A ref lasts as long as its element stays in the DOM, so after a navigation or a re-render the model should read again. Cross-origin iframes are not walked: the model falls back to coordinates from a screenshot there.

## Keys

The toolset speaks xdotool names (`ctrl+a`, `Return`, `Page_Down`); drivers receive Playwright names. `toPlaywrightChord('ctrl+a')` gives `Control+A`; `toPlaywrightKeySequence('ctrl+a Return')` splits a space-separated sequence. Both are in `/keys`, for drivers or tools of your own.

## Building your own tool

`buildPageCall(op)` from `/page-script` returns the string expression the tools evaluate in the page, with result types (`ReadResult`, `ResolveResult`, `FormResult`, `InspectResult`). Use it to add a tool that reads the same tree, rather than writing a second page walker.
