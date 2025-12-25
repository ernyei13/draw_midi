
import { GoogleGenAI, Type } from "@google/genai";
import { UIControl, ControlType } from "../types";

export const analyzePaperUI = async (base64Image: string): Promise<UIControl[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `Analyze this image of a hand-drawn paper user interface. 
  Identify all hand-drawn interactive components:
  1. 'button' (rectangles/squares)
  2. 'slider' (long horizontal or vertical slots/bars)
  3. 'knob' (circular dials)
  
  For each detected element:
  - Determine its type.
  - Give it a brief, descriptive label based on nearby handwriting.
  - Provide a bounding box [ymin, xmin, ymax, xmax] where values are 0-1000 relative to image size.
  
  Return ONLY a JSON list of objects.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: base64Image,
              },
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING, description: "Must be 'button', 'slider', or 'knob'" },
              label: { type: Type.STRING },
              ymin: { type: Type.NUMBER },
              xmin: { type: Type.NUMBER },
              ymax: { type: Type.NUMBER },
              xmax: { type: Type.NUMBER },
            },
            required: ["type", "label", "ymin", "xmin", "ymax", "xmax"],
          },
        },
      },
    });

    const jsonStr = response.text;
    if (!jsonStr) return [];

    const rawControls = JSON.parse(jsonStr);
    return rawControls.map((c: any, index: number) => {
      let type = ControlType.BUTTON;
      if (c.type === 'slider') type = ControlType.SLIDER;
      if (c.type === 'knob') type = ControlType.KNOB;

      return {
        id: `ctrl-${index}-${Date.now()}`,
        type,
        label: c.label || `${type} ${index + 1}`,
        box: {
          ymin: c.ymin,
          xmin: c.xmin,
          ymax: c.ymax,
          xmax: c.xmax,
        },
        value: 0,
        isHovered: false,
        isPressed: false,
      };
    });
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return [];
  }
};
