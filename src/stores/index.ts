import { createContext, useContext } from 'react'

export interface GnosisContextProps {
  chainId: number
  safeAddress: string
  isDev?: boolean
}

const Context = createContext<GnosisContextProps | null>(null)

export const GnosisContextProvider = Context.Provider
export const GnosisContext = Context
export const useGnosisContext = () => useContext(GnosisContext)
