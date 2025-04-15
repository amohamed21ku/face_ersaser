// src/ai/flows/enhance-image-quality.ts
'use server';

/**
 * @fileOverview An image enhancement AI agent.
 *
 * - enhanceImageQuality - A function that enhances the quality of an image.
 * - EnhanceImageQualityInput - The input type for the enhanceImageQuality function.
 * - EnhanceImageQualityOutput - The return type for the enhanceImageQuality function.
 */

import {ai} from '@/ai/ai-instance';
import {z} from 'genkit';

const EnhanceImageQualityInputSchema = z.object({
  imageUrl: z.string().describe('The URL of the image to enhance.'),
});
export type EnhanceImageQualityInput = z.infer<typeof EnhanceImageQualityInputSchema>;

const EnhanceImageQualityOutputSchema = z.object({
  enhancedImageUrl: z.string().describe('The URL of the enhanced image.'),
});
export type EnhanceImageQualityOutput = z.infer<typeof EnhanceImageQualityOutputSchema>;

export async function enhanceImageQuality(input: EnhanceImageQualityInput): Promise<EnhanceImageQualityOutput> {
  return enhanceImageQualityFlow(input);
}

const enhanceImageQualityPrompt = ai.definePrompt({
  name: 'enhanceImageQualityPrompt',
  input: {
    schema: z.object({
      imageUrl: z.string().describe('The URL of the image to enhance.'),
    }),
  },
  output: {
    schema: z.object({
      enhancedImageUrl: z.string().describe('The URL of the enhanced image.'),
    }),
  },
  prompt: `You are an AI image enhancer. You will be given an image URL, and you will return a URL to an enhanced version of the image.

Image URL: {{{imageUrl}}}

Respond with a URL to the enhanced image.

Ensure that the enhanced image preserves the original image's content while improving its clarity, resolution, and detail. The goal is to make the face detection more accurate, especially for low-resolution images.
`,
});

const enhanceImageQualityFlow = ai.defineFlow<
  typeof EnhanceImageQualityInputSchema,
  typeof EnhanceImageQualityOutputSchema
>({
  name: 'enhanceImageQualityFlow',
  inputSchema: EnhanceImageQualityInputSchema,
  outputSchema: EnhanceImageQualityOutputSchema,
},
async input => {
  const {output} = await enhanceImageQualityPrompt(input);
  return output!;
});
