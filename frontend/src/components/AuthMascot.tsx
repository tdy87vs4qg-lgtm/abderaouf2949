import Mascot from './mascot/Mascot'
import type { MascotState } from './mascot/types'

type AuthMascotProps = {
  /**
   * The mascot's behaviour, derived from the login/signup form:
   *  - 'idle'     : eyes open, gaze-tracking the cursor, breathing & blinking
   *  - 'covering' : paws pressed over the eyes while a hidden password is typed
   *  - 'peeking'  : paws part slightly so it can peek when "show password" is on
   */
  state: MascotState
}

/**
 * The site's authentication mascot.
 *
 * This is now a fully code-drawn (SVG) cartoon fox whose eyes follow the
 * cursor, blinks and breathes on idle, covers its eyes with its paws while a
 * hidden password is typed, and peeks through a gap in its paws when the
 * password is revealed. All motion is driven by Framer Motion and it degrades
 * gracefully (no gaze / idle motion) when the user prefers reduced motion or is
 * on a touch device without a pointer.
 */
export default function AuthMascot({ state }: AuthMascotProps) {
  return <Mascot state={state} className="mascot-fox" />
}
