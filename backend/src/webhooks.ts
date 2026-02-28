// src/webhooks.ts

// This endpoint is what you register in your POS admin panel
app.post('/api/webhooks/pos-sale', async (req: Request, res: Response) => {
    const { event_type, data } = req.body;

    // 1. Verify the signature (Security: Ensure it's actually from the POS)
    if (!verifyPosSignature(req)) return res.status(401).send();

    if (event_type === 'order.completed') {
        for (const item of data.line_items) {
            // 2. Decrement your "Book" stock in the database
            await prisma.product.update({
                where: { sku: item.sku },
                data: { stock: { decrement: item.quantity } }
            });

            // 3. LOGIC: If stock is now low, trigger the Vision Camera check
            checkShelfVisuals(item.sku);
        }
    }

    res.status(200).send('ACK'); // Always acknowledge quickly
});