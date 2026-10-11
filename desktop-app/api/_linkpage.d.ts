export interface LinkDesign {
  bg: { type: 'gradient' | 'color' | 'image'; preset: string; color: string; image: string; blur: number; dim: number }
  effect: string; font: string; text: string; shadowText: boolean; verified: boolean; online: boolean; ring: string
  btn: { bg: string; fg: string; radius: number; shadow: boolean }
}
export interface RenderButton { label: string; href: string; style?: 'pill' | 'card'; image?: string; icon?: string; bg?: string; fg?: string; anim?: string }
export const GRADIENTS: Record<string, string>
export const FONTS: Record<string, [string, string]>
export const EFFECTS: string[]
export const BTN_ANIMS: string[]
export function normalizeUrl(u: unknown): string
export function normalizeDesign(page: { design?: unknown; theme?: string } | null | undefined): LinkDesign
export function renderLinkPage(o: { title: string; bio: string; avatar: string | null; buttons: RenderButton[]; design: LinkDesign; preview?: boolean }): string
