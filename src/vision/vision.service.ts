import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import OpenAI from 'openai';
import { ConfigLoader } from '@/config/configuration';

/**
 * Structured return type for gas cylinder vision analysis.
 */
export interface GasCylinderAnalysis {
  brand: string;
  sizeKg: number;
  confidence: number;
}

/**
 * VisionService
 * Uses OpenAI GPT-4o vision capabilities to analyze gas cylinder photos received via WhatsApp.
 * Fetches media securely using WhatsApp permanent token, converts to base64, and enforces strict JSON output.
 */
@Injectable()
export class VisionService {
  private readonly logger = new Logger(VisionService.name);
  private readonly openai: OpenAI;
  private readonly whatsappToken: string;

  constructor(config: ConfigLoader) {
    this.whatsappToken = config.whatsappApiToken;

    this.openai = new OpenAI({
      apiKey: config.openaiApiKey,
    });
  }

  /**
   * Analyzes a gas cylinder image from WhatsApp media ID.
   * Returns structured data or null when confidence < 0.70.
   */
  async analyzeGasCylinder(
    mediaId: string,
  ): Promise<GasCylinderAnalysis | null> {
    try {
      // 1. Get media metadata + temporary download URL from WhatsApp
      const mediaMeta = await axios.get(
        `https://graph.facebook.com/v18.0/${mediaId}`,
        {
          headers: { Authorization: `Bearer ${this.whatsappToken}` },
        },
      );

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const { url: downloadUrl, mime_type: mimeType } = mediaMeta.data;

      if (!downloadUrl) {
        throw new Error('No download URL returned by WhatsApp for media');
      }

      // 2. Download the actual binary (image)
      const mediaResponse = await axios.get(downloadUrl, {
        headers: { Authorization: `Bearer ${this.whatsappToken}` },
        responseType: 'arraybuffer',
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const base64Image = Buffer.from(mediaResponse.data, 'binary').toString(
        'base64',
      );
      const dataUrl = `data:${mimeType};base64,${base64Image}`;

      // 3. Call GPT-4o with strict JSON schema instruction
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'You are an expert gas cylinder inspector. Analyze the provided image and return ONLY a valid JSON object with exactly these fields: brand (string), sizeKg (number in kilograms), confidence (number 0.0-1.0). If you are not highly confident, still return the best guess but the caller will filter low confidence results.',
              },
              {
                type: 'image_url',
                image_url: {
                  url: dataUrl,
                },
              },
            ],
          },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 300,
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        this.logger.warn('OpenAI returned empty content for vision analysis');
        return null;
      }

      const parsed = JSON.parse(content) as Partial<GasCylinderAnalysis>;

      // 4. Enforce confidence threshold (strict business rule)
      if (typeof parsed.confidence !== 'number' || parsed.confidence < 0.7) {
        this.logger.log(
          `Vision confidence too low (${parsed.confidence ?? 'N/A'}) - returning null`,
        );
        return null;
      }

      // Basic validation
      if (!parsed.brand || typeof parsed.sizeKg !== 'number') {
        this.logger.warn('Vision response missing required fields');
        return null;
      }

      const result: GasCylinderAnalysis = {
        brand: parsed.brand.trim(),
        sizeKg: Math.round(parsed.sizeKg * 10) / 10, // normalize
        confidence: parsed.confidence,
      };

      this.logger.log(
        `Vision analysis success: ${result.brand} ${result.sizeKg}kg (conf=${result.confidence})`,
      );
      return result;
    } catch (error: any) {
      this.logger.error(
        `Vision analysis failed for media ${mediaId}: ${error.message}`,
      );
      return null;
    }
  }
}
