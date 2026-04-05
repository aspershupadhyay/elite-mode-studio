/**
 * Shared types for the AI Browser feature.
 */

export interface Tab {
  id:         string
  initialUrl: string   // set once — used as webview src, NEVER changed after mount
  url:        string   // current page URL — drives isHome check + address bar
  inputUrl:   string
  title:      string
  favicon:    string
  loading:    boolean
  canBack:    boolean
  canFwd:     boolean
  error:      string | null
}

export interface PendingPrompt {
  postId:     string
  prompt:     string
  title:      string
  status:     'pending' | 'injecting' | 'waiting_image' | 'done' | 'error'
  error?:     string
  imagePath?: string
}

export interface ImageGenQueueJob {
  postId:    string
  prompt:    string
  title:     string
  pageIndex: number
}

export interface AiBrowserHandle {
  /** Queue a batch of image gen jobs for fully-automatic execution */
  queueBatch: (jobs: ImageGenQueueJob[], chatGptUrl: string) => void
  /** Cancel any running auto-queue */
  cancelQueue: () => void
}

export type ClearStatus = 'idle' | 'clearing' | 'done'
