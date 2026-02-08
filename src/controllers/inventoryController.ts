import { Request, Response } from 'express';
import { InventoryService } from '../services/inventoryService';

export class InventoryController {
  /**
   * POST /api/stock/add
   * Triggered when staff scans items onto a specific shelf.
   */
  static async addStock(req: Request, res: Response) {
    try {
      const { sku, quantity, shelfLabel } = req.body;

      if (!sku || !quantity || !shelfLabel) {
        return res.status(400).json({ error: "Missing required fields: sku, quantity, shelfLabel" });
      }

      const result = await InventoryService.commitStock(sku, Number(quantity), shelfLabel);
      
      return res.status(200).json({
        message: "Stock successfully added",
        data: result
      });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }

  /**
   * POST /api/stock/sale
   * Triggered by a POS Webhook when a customer buys an item.
   */
  static async recordSale(req: Request, res: Response) {
    try {
      const { sku, quantity } = req.body;

      if (!sku || !quantity) {
        return res.status(400).json({ error: "Missing sku or quantity" });
      }

      // Logic: Subtract from database
      const product = await InventoryService.subtractStock(sku, Number(quantity));
      
      return res.status(200).json({
        message: "Sale recorded",
        remainingStock: product.stock,
        needsRestock: product.stock <= product.minThreshold
      });
    } catch (error: any) {
      return res.status(500).json({ error: "Failed to process sale" });
    }
  }
}