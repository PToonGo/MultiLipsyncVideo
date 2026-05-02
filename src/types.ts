export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Character {
  id: string;
  name: string;
  box: Box; // Normalized 0-100 values
}

export interface ScriptLine {
  id: string;
  characterId: string;
  text: string;
  voiceStyle: string;
  ageRange: 'old' | 'middle' | 'youth';
  accentDetail: 'north-std' | 'north-hn' | 'central-hue' | 'south-hcm' | 'south-sw';
}

export type GenerationStatus = 'idle' | 'uploading' | 'generating' | 'success' | 'error';
