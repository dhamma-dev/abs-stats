import { createContext, useContext } from 'react'
import type { Me, UserStats } from '../../../shared/types.ts'

/** Who is signed in, whose stats are on screen, and for which period. */
export interface View {
  me: Me
  userId: string
  year: number | null
  stats: UserStats | undefined
  loading: boolean
  error: unknown
}

export const ViewCtx = createContext<View | null>(null)
export const useView = () => useContext(ViewCtx)!
