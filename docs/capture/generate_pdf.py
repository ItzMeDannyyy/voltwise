import os
from reportlab.lib.pagesizes import inch
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Image as RLImage,
    Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas
from PIL import Image as PILImage

PDF_PATH = "docs/VoltWise_User_Manual.pdf"
LOGO_COMPLETE = "app-voltwise/assets/images/voltwise-logo/voltwise-logo-complete.png"
LOGO_ENHANCED = "app-voltwise/assets/images/voltwise-logo/enhanced-voltwise-logo.png"

# Folio Page Dimensions (8.5 in x 13 in = 612 pt x 936 pt)
FOLIO_WIDTH = 8.5 * inch
FOLIO_HEIGHT = 13.0 * inch
MARGIN = 0.75 * inch

# Color Palette: Minimalist Electric Blue
PRIMARY_BLUE = colors.HexColor("#0D7EE1")
DARK_NAVY = colors.HexColor("#0F172A")
MUTED_SLATE = colors.HexColor("#64748B")
BG_LIGHT_BLUE = colors.HexColor("#F0F7FF")
BORDER_BLUE = colors.HexColor("#BAE6FD")
ACCENT_RED = colors.HexColor("#E11D48")
BG_LIGHT_RED = colors.HexColor("#FFF1F2")

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_decorations(self, page_count):
        if self._pageNumber == 1:
            return  # Suppress on cover page
            
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(MUTED_SLATE)
        
        # Running Header
        header_y = FOLIO_HEIGHT - 0.5 * inch
        if os.path.exists(LOGO_ENHANCED):
            self.drawImage(LOGO_ENHANCED, MARGIN, header_y - 2, width=16, height=18, preserveAspectRatio=True, mask='auto')
        self.drawString(MARGIN + 24, header_y + 3, "VoltWise Smart Energy System · User Manual")
        self.drawRightString(FOLIO_WIDTH - MARGIN, header_y + 3, "Folio Format (8.5\" × 13\")")
        
        self.setStrokeColor(colors.HexColor("#E2E8F0"))
        self.setLineWidth(0.6)
        self.line(MARGIN, header_y - 6, FOLIO_WIDTH - MARGIN, header_y - 6)
        
        # Running Footer
        footer_y = 0.5 * inch
        self.line(MARGIN, footer_y + 12, FOLIO_WIDTH - MARGIN, footer_y + 12)
        self.drawString(MARGIN, footer_y, "VoltWise Systems — Confidential & Proprietary for Homeowners")
        page_str = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(FOLIO_WIDTH - MARGIN, footer_y, page_str)
        self.restoreState()

def build_pdf():
    os.makedirs(os.path.dirname(PDF_PATH), exist_ok=True)
    doc = SimpleDocTemplate(
        PDF_PATH,
        pagesize=(FOLIO_WIDTH, FOLIO_HEIGHT),
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=MARGIN,
        bottomMargin=MARGIN
    )

    styles = getSampleStyleSheet()

    # Custom Typography Styles
    title_style = ParagraphStyle(
        "CoverTitle",
        fontName="Helvetica-Bold",
        fontSize=24,
        leading=28,
        textColor=DARK_NAVY,
        alignment=1, # Center
        spaceAfter=8
    )
    subtitle_style = ParagraphStyle(
        "CoverSubtitle",
        fontName="Helvetica",
        fontSize=12,
        leading=16,
        textColor=PRIMARY_BLUE,
        alignment=1,
        spaceAfter=24
    )
    ch_header_style = ParagraphStyle(
        "ChapterHeader",
        fontName="Helvetica-Bold",
        fontSize=15,
        leading=19,
        textColor=DARK_NAVY,
        spaceBefore=12,
        spaceAfter=4
    )
    desc_style = ParagraphStyle(
        "ChapterDesc",
        fontName="Helvetica",
        fontSize=9.5,
        leading=13.5,
        textColor=DARK_NAVY,
        spaceAfter=8
    )
    step_num_style = ParagraphStyle(
        "StepNum",
        fontName="Helvetica-Bold",
        fontSize=9.5,
        leading=13.5,
        textColor=PRIMARY_BLUE
    )
    step_text_style = ParagraphStyle(
        "StepText",
        fontName="Helvetica",
        fontSize=9.5,
        leading=13.5,
        textColor=DARK_NAVY
    )
    callout_style = ParagraphStyle(
        "CalloutText",
        fontName="Helvetica",
        fontSize=9,
        leading=12.5,
        textColor=DARK_NAVY
    )
    caption_style = ParagraphStyle(
        "ImageCaption",
        fontName="Helvetica-Oblique",
        fontSize=8,
        leading=11,
        textColor=MUTED_SLATE,
        alignment=1,
        spaceAfter=4
    )
    meta_style = ParagraphStyle(
        "MetaText",
        fontName="Helvetica",
        fontSize=8.5,
        leading=11,
        textColor=DARK_NAVY
    )

    story = []

    # ------------------ COVER PAGE ------------------
    story.append(Spacer(1, 1.8 * inch))
    if os.path.exists(LOGO_COMPLETE):
        story.append(RLImage(LOGO_COMPLETE, width=3.4 * inch, height=1.34 * inch))
        story.append(Spacer(1, 0.4 * inch))
        
    story.append(Paragraph("USER MANUAL & OPERATING GUIDE", title_style))
    story.append(Paragraph("Smart Home Energy Monitoring & Automated Circuit Protection System", subtitle_style))
    story.append(HRFlowable(width="60%", thickness=1.5, color=PRIMARY_BLUE, spaceBefore=4, spaceAfter=24))

    meta_table_data = [
        [Paragraph("<b>Target Audience:</b>", meta_style), Paragraph("Homeowners, Residents & Facility Managers", meta_style)],
        [Paragraph("<b>Supported Platforms:</b>", meta_style), Paragraph("VoltWise Android App (APK) & Web Portal", meta_style)],
        [Paragraph("<b>Core Architecture:</b>", meta_style), Paragraph("ESP32 IoT Node + PZEM-004T + Staggered Dual Relays", meta_style)],
        [Paragraph("<b>Document Format:</b>", meta_style), Paragraph("Folio Size (8.5\" × 13\") · Verified Captures Standard", meta_style)],
        [Paragraph("<b>Web Portal:</b>", meta_style), Paragraph("https://voltwise-orcin.vercel.app/", meta_style)]
    ]
    meta_tbl = Table(meta_table_data, colWidths=[2.2 * inch, 4.3 * inch])
    meta_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
        ('BOX', (0, 0), (-1, -1), 0.8, colors.HexColor("#E2E8F0")),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#EDF2F7")),
        ('TOPPADDING', (0, 0), (-1, -1), 7),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
    ]))
    story.append(meta_tbl)
    story.append(PageBreak())

    # ------------------ CHAPTERS CONTENT ------------------
    import sys
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from manual_content import CHAPTERS

    printable_w = FOLIO_WIDTH - (2 * MARGIN)

    for ch in CHAPTERS:
        ch_story = []
        # Header
        ch_title_p = Paragraph(f"<font color='#0D7EE1'><b>CHAPTER {ch['num']} ·</b></font> {ch['title'].upper()}", ch_header_style)
        ch_story.append(ch_title_p)

        # Metadata banner
        meta_row = [
            Paragraph(f"<font color='#0D7EE1'><b>Who:</b></font> {ch['who']}", meta_style),
            Paragraph(f"<font color='#0D7EE1'><b>Prereq:</b></font> {ch['prereq']}", meta_style),
            Paragraph(f"<font color='#0D7EE1'><b>Duration:</b></font> {ch['time']}", meta_style),
        ]
        ch_meta_tbl = Table([meta_row], colWidths=[2.2 * inch, 3.3 * inch, 1.5 * inch])
        ch_meta_tbl.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
            ('BOX', (0, 0), (-1, -1), 0.6, colors.HexColor("#E2E8F0")),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ]))
        ch_story.append(ch_meta_tbl)
        ch_story.append(Spacer(1, 6))

        # Description
        ch_story.append(Paragraph(ch['desc'], desc_style))

        # Steps
        for idx, (st_text, img_path, caption, expected) in enumerate(ch["steps"], start=1):
            step_row = [
                Paragraph(f"Step {idx}.", step_num_style),
                Paragraph(st_text, step_text_style)
            ]
            st_tbl = Table([step_row], colWidths=[0.65 * inch, printable_w - 0.7 * inch])
            st_tbl.setStyle(TableStyle([
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('LEFTPADDING', (0, 0), (-1, -1), 0),
                ('RIGHTPADDING', (0, 0), (-1, -1), 0),
                ('TOPPADDING', (0, 0), (-1, -1), 2),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
            ]))
            ch_story.append(st_tbl)

            # Image
            if img_path and os.path.exists(img_path):
                try:
                    with PILImage.open(img_path) as im:
                        orig_w, orig_h = im.size
                        aspect = orig_h / orig_w
                        if orig_w > orig_h:
                            target_w = 4.6 * inch
                            target_h = target_w * aspect
                        else:
                            target_w = 2.1 * inch
                            target_h = target_w * aspect
                            
                        # Keep image height within folio bounds
                        if target_h > 4.2 * inch:
                            target_h = 4.2 * inch
                            target_w = target_h / aspect

                        img_flow = RLImage(img_path, width=target_w, height=target_h)
                        img_tbl = Table([[img_flow]], colWidths=[printable_w])
                        img_tbl.setStyle(TableStyle([
                            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                            ('TOPPADDING', (0, 0), (-1, -1), 4),
                            ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
                        ]))
                        ch_story.append(img_tbl)
                except Exception as e:
                    print(f"Error loading {img_path}: {e}")

                if caption:
                    ch_story.append(Paragraph(caption, caption_style))

            if expected:
                callout_data = [[
                    Paragraph(f"<font color='#0D7EE1'><b>You should see:</b></font> {expected}", callout_style)
                ]]
                callout_tbl = Table(callout_data, colWidths=[printable_w])
                callout_tbl.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, -1), BG_LIGHT_BLUE),
                    ('LINEBEFORE', (0, 0), (0, -1), 2.5, PRIMARY_BLUE),
                    ('TOPPADDING', (0, 0), (-1, -1), 5),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
                    ('LEFTPADDING', (0, 0), (-1, -1), 8),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 8),
                ]))
                ch_story.append(callout_tbl)
                ch_story.append(Spacer(1, 4))

        # Troubleshooting
        if ch.get("troubleshoot"):
            ch_story.append(Spacer(1, 6))
            ch_story.append(Paragraph("<font color='#E11D48'><b>Troubleshooting & Common Failure Modes</b></font>", ParagraphStyle(
                "TrH", fontName="Helvetica-Bold", fontSize=9.5, leading=12, textColor=ACCENT_RED, spaceAfter=4
            )))
            tr_rows = [
                [Paragraph("<b>Symptom / Problem</b>", meta_style), Paragraph("<b>Recommended Action</b>", meta_style)]
            ]
            for symp, act in ch["troubleshoot"]:
                tr_rows.append([
                    Paragraph(symp, meta_style),
                    Paragraph(act, meta_style)
                ])
            tr_tbl = Table(tr_rows, colWidths=[2.6 * inch, printable_w - 2.65 * inch])
            tr_tbl.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), BG_LIGHT_RED),
                ('BACKGROUND', (0, 1), (0, -1), colors.HexColor("#FAFAFA")),
                ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor("#FECDD3")),
                ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#FFE4E6")),
                ('TOPPADDING', (0, 0), (-1, -1), 4),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                ('LEFTPADDING', (0, 0), (-1, -1), 6),
                ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ]))
            ch_story.append(tr_tbl)

        ch_story.append(PageBreak())
        story.extend(ch_story)

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Generated Folio PDF successfully at: {PDF_PATH}")

if __name__ == "__main__":
    build_pdf()
