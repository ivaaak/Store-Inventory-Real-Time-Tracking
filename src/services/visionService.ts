// src/services/visionService.ts
import fs from 'fs';
import OpenAI from 'openai';
import { AIAnalysisResult, VisualItemAnalysis } from '../types';
import { logger } from '../utils/logger';

// Initialize OpenAI with your API Key
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Encodes a local file to base64 for API transmission
 */
const encodeImage = (imagePath: string): string => {
  const imageBuffer = fs.readFileSync(imagePath);
  return imageBuffer.toString('base64');
};

/**
 * Analyze shelf image using OpenAI Vision API
 * Returns structured data about detected items and their counts
 */
export async function analyzeShelfImage(
  imagePath: string,
  expectedProducts: string[]
): Promise<AIAnalysisResult> {
  
  logger.info('Starting vision analysis', { 
    imagePath, 
    productCount: expectedProducts.length 
  });

  // Validate image file exists
  if (!fs.existsSync(imagePath)) {
    logger.error('Image file not found', { imagePath });
    throw new Error(`Image file not found: ${imagePath}`);
  }

  const base64Image = encodeImage(imagePath);

  try {
    // Construct a detailed prompt for the AI
    const systemPrompt = `You are a retail inventory assistant specialized in analyzing shelf images.
Your task is to count products on store shelves and assess their stock status.

You must analyze the image and return a JSON object with this exact structure:
{
  "items": [
    {
      "name": "Product Name",
      "count": 0,
      "status": "EMPTY" | "LOW" | "FULL",
      "confidence": 0.0-1.0
    }
  ]
}

Rules:
1. Only analyze these specific products: ${expectedProducts.join(', ')}
2. "count" must be an integer (0 or positive)
3. "status" must be one of: EMPTY, LOW, FULL
   - EMPTY: 0 items visible
   - LOW: 1-3 items visible
   - FULL: 4+ items visible
4. "confidence" should reflect how certain you are (0.0 to 1.0)
5. If a product is not visible, set count to 0 and status to EMPTY
6. Be conservative with counts - if unsure, estimate lower
7. Consider partially visible products as full items if >50% visible`;

    const userPrompt = `Analyze this store shelf image and count each of these products:
${expectedProducts.map((p, i) => `${i + 1}. ${p}`).join('\n')}

For each product, determine:
- Exact count of items visible
- Stock status (EMPTY/LOW/FULL)
- Your confidence level in this assessment

Return only valid JSON, no additional text.`;

    logger.info('Calling OpenAI Vision API', { 
      model: 'gpt-4o',
      expectedProducts 
    });

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: [
            { 
              type: "text", 
              text: userPrompt 
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`,
                detail: "high" // Use high detail for better accuracy
              },
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 1000,
      temperature: 0.3, // Lower temperature for more consistent results
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("AI returned an empty response");
    }

    logger.info('OpenAI response received', { 
      contentLength: content.length 
    });

    // Parse the AI's JSON output
    const parsedData = JSON.parse(content);
    
    // Validate the response structure
    if (!parsedData.items || !Array.isArray(parsedData.items)) {
      logger.error('Invalid AI response structure', { parsedData });
      throw new Error('AI response missing "items" array');
    }

    // Validate and sanitize each item
    const detectedItems: VisualItemAnalysis[] = parsedData.items.map((item: any) => {
      // Ensure all required fields are present
      if (!item.name || typeof item.count !== 'number' || !item.status) {
        logger.warn('Invalid item in AI response', { item });
        return null;
      }

      // Validate status enum
      const validStatuses = ['EMPTY', 'LOW', 'FULL', 'MISPLACED'];
      if (!validStatuses.includes(item.status)) {
        item.status = 'EMPTY'; // Default to EMPTY if invalid
      }

      // Ensure count is non-negative integer
      item.count = Math.max(0, Math.floor(item.count));

      // Ensure confidence is between 0 and 1
      item.confidence = Math.max(0, Math.min(1, item.confidence || 0.5));

      return {
        name: item.name,
        count: item.count,
        status: item.status,
        confidence: item.confidence
      };
    }).filter((item: any) => item !== null);

    // Ensure all expected products are in the response
    const missingProducts = expectedProducts.filter(
      expected => !detectedItems.some(detected => detected.name === expected)
    );

    // Add missing products with zero count
    for (const missing of missingProducts) {
      logger.warn('Product not detected by AI, adding with zero count', { 
        product: missing 
      });
      
      detectedItems.push({
        name: missing,
        count: 0,
        status: 'EMPTY',
        confidence: 0.5 // Low confidence for missing items
      });
    }

    logger.info('Vision analysis completed', {
      detectedCount: detectedItems.length,
      averageConfidence: (
        detectedItems.reduce((sum, item) => sum + item.confidence, 0) / 
        detectedItems.length
      ).toFixed(2)
    });

    return {
      timestamp: new Date(),
      detectedItems,
      rawOutput: content
    };

  } catch (error: any) {
    logger.error("Vision AI Error", { 
      error: error.message,
      stack: error.stack,
      imagePath 
    });

    // Return a fallback "Empty" result if the AI fails
    // This prevents system crashes while still logging the issue
    return {
      timestamp: new Date(),
      detectedItems: expectedProducts.map(p => ({
        name: p,
        count: 0,
        status: 'EMPTY',
        confidence: 0
      })),
      rawOutput: `Error: ${error.message}`
    };
    
  } finally {
    // Cleanup: Remove the image from local storage after processing
    try {
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
        logger.info('Cleaned up uploaded image', { imagePath });
      }
    } catch (cleanupError: any) {
      logger.error('Failed to cleanup image file', { 
        imagePath, 
        error: cleanupError.message 
      });
    }
  }
}

/**
 * Trigger camera snapshot (future implementation)
 * This would integrate with IP cameras to capture images on-demand
 */
export async function triggerCameraSnapshot(cameraUrl: string): Promise<string> {
  logger.info('Triggering camera snapshot', { cameraUrl });
  
  // TODO: Implement actual camera integration
  // This could use ONVIF protocol, RTSP, or vendor-specific APIs
  
  // For now, return a placeholder
  throw new Error('Camera integration not yet implemented');
  
  /*
  // Example implementation:
  const response = await axios.get(`${cameraUrl}/snapshot`, {
    responseType: 'arraybuffer',
    timeout: 10000
  });
  
  const imagePath = `uploads/camera-${Date.now()}.jpg`;
  fs.writeFileSync(imagePath, response.data);
  
  return imagePath;
  */
}

/**
 * Validate image quality before processing
 */
export function validateImage(imagePath: string): { valid: boolean; reason?: string } {
  try {
    const stats = fs.statSync(imagePath);
    
    // Check file size (min 10KB, max 10MB)
    if (stats.size < 10 * 1024) {
      return { valid: false, reason: 'Image file too small (min 10KB)' };
    }
    
    if (stats.size > 10 * 1024 * 1024) {
      return { valid: false, reason: 'Image file too large (max 10MB)' };
    }
    
    // Check file exists and is readable
    fs.accessSync(imagePath, fs.constants.R_OK);
    
    return { valid: true };
  } catch (error: any) {
    return { valid: false, reason: error.message };
  }
}
