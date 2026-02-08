import { Request, Response } from 'express';
import { analyzeShelfImage } from '../services/visionService';
import { InventoryService } from '../services/inventoryService';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class VisionController {
  /**
   * POST /api/vision/audit
   * Receives a multipart image upload and a shelf label.
   */
  static async performAudit(req: Request, res: Response) {
    try {
      const { shelfLabel } = req.body;
      const imageFile = req.file;

      if (!imageFile || !shelfLabel) {
        return res.status(400).json({ error: "Image and shelfLabel are required" });
      }

      // 1. Get current items assigned to this shelf
      const shelf = await prisma.shelf.findUnique({
        where: { label: shelfLabel },
        include: { products: true }
      });

      if (!shelf) return res.status(404).json({ error: "Shelf not found in system" });

      // 2. Call the Vision AI Service
      const productNames = shelf.products.map(p => p.name);
      const aiResults = await analyzeShelfImage(imageFile.path, productNames);

      // 3. Process each detection
      const auditSummary = [];
      for (const detection of aiResults.detectedItems) {
        const product = shelf.products.find(p => p.name === detection.name);
        
        if (product) {
          // Log the discrepancy in the DB
          await prisma.auditLog.create({
            data: {
              productId: product.id,
              systemCount: product.stock,
              visualCount: detection.count,
              discrepancy: product.stock - detection.count,
              imageUrl: imageFile.path
            }
          });

          // Run the reconciliation logic (e.g., trigger alerts if phantom stock)
          await InventoryService.reconcile(product.id);
          
          auditSummary.push({
            sku: product.sku,
            status: detection.status,
            discrepancy: product.stock - detection.count
          });
        }
      }

      return res.status(200).json({
        message: "Audit complete",
        summary: auditSummary
      });

    } catch (error: any) {
      console.error("Audit Error:", error);
      return res.status(500).json({ error: "Internal server error during vision audit" });
    }
  }
}