import { describe, it, expect } from 'vitest'
import { isModelUnavailable, stripThinking, TEXT_MODELS } from './ai'

describe('Groq — modèles de secours', () => {
  it('modèle retiré / inaccessible → on essaie le suivant', () => {
    expect(isModelUnavailable('{"error":{"message":"The model `llama-3.3-70b-versatile` does not exist or you do not have access to it.","type":"invalid_request_error","code":"model_not_found"}}')).toBe(true)
    expect(isModelUnavailable('Groq HTTP 404')).toBe(true)
    expect(isModelUnavailable('The model `x` has been decommissioned')).toBe(true)
  })
  it('autre erreur (clé, quota) → remontée telle quelle', () => {
    expect(isModelUnavailable('Invalid API Key')).toBe(false)
    expect(isModelUnavailable('Rate limit reached for model')).toBe(false)
  })
  it('raisonnement <think> retiré', () => {
    expect(stripThinking('<think>je réfléchis</think>\ncoucou vous #fr')).toBe('coucou vous #fr')
  })
  it('plusieurs modèles en secours', () => {
    expect(TEXT_MODELS.length).toBeGreaterThan(3)
  })
})
