import type { MatterPosition, SceneKind } from '../types'

export interface ScenePreset {
  kind: Extract<SceneKind, 'scene' | 'prologue' | 'epilogue' | 'interlude'>
  label: string
}

export interface MatterPreset {
  kind: Exclude<SceneKind, ScenePreset['kind'] | 'custom-scene' | 'custom-matter'>
  label: string
  defaultPosition: MatterPosition
}

export const SCENE_PRESETS: ScenePreset[] = [
  { kind: 'scene', label: 'Scene' },
  { kind: 'prologue', label: 'Prologue' },
  { kind: 'epilogue', label: 'Epilogue' },
  { kind: 'interlude', label: 'Interlude' },
]

export const MATTER_PRESETS: MatterPreset[] = [
  { kind: 'dedication', label: 'Dedication', defaultPosition: 'start' },
  { kind: 'foreword', label: 'Foreword', defaultPosition: 'start' },
  { kind: 'acknowledgments', label: 'Acknowledgments', defaultPosition: 'end' },
  { kind: 'authors-note', label: "Author's Note", defaultPosition: 'end' },
  { kind: 'bibliography', label: 'Bibliography', defaultPosition: 'end' },
  { kind: 'glossary', label: 'Glossary/Appendix', defaultPosition: 'end' },
  { kind: 'editors-notes', label: "Editor's Notes", defaultPosition: 'end' },
]
