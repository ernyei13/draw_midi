
export enum ControlType {
  BUTTON = 'button',
  SLIDER = 'slider',
  KNOB = 'knob'
}

export interface BoundingBox {
  ymin: number; // 0-1000
  xmin: number; // 0-1000
  ymax: number; // 0-1000
  xmax: number; // 0-1000
}

export interface UIControl {
  id: string;
  type: ControlType;
  label: string;
  box: BoundingBox;
  value: number; // 0-100 for slider/knob, 0/1 for button toggle state
  isHovered: boolean;
  isPressed: boolean;
}

export interface HandLandmark {
  x: number;
  y: number;
  z: number;
}
