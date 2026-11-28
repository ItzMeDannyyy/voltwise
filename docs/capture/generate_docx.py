import os
import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn

DOCX_PATH = "docs/VoltWise_User_Manual.docx"
LOGO_COMPLETE = "app-voltwise/assets/images/voltwise-logo/voltwise-logo-complete.png"
LOGO_ENHANCED = "app-voltwise/assets/images/voltwise-logo/enhanced-voltwise-logo.png"

# Color Palette: Minimalist Electric Blue
COLOR_PRIMARY = RGBColor(13, 126, 225)      # #0D7EE1
COLOR_DARK = RGBColor(15, 23, 42)          # #0F172A
COLOR_MUTED = RGBColor(100, 116, 139)      # #64748B
COLOR_BORDER_HEX = "0D7EE1"
COLOR_BG_HEX = "F0F7FF"
COLOR_WARN_HEX = "FFF1F2"

def set_cell_background(cell, fill_hex):
    tcPr = cell._element.get_or_add_tcPr()
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>')
    tcPr.append(shd)

def set_cell_margins(cell, top=100, bottom=100, left=150, right=150):
    tcPr = cell._element.get_or_add_tcPr()
    tcMar = parse_xml(f'''
        <w:tcMar {nsdecls("w")}>
            <w:top w:w="{top}" w:type="dxa"/>
            <w:bottom w:w="{bottom}" w:type="dxa"/>
            <w:left w:w="{left}" w:type="dxa"/>
            <w:right w:w="{right}" w:type="dxa"/>
        </w:tcMar>
    ''')
    tcPr.append(tcMar)

def add_callout(doc, text_prefix, text_body, fill_hex="F0F7FF", border_color="0D7EE1"):
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    table.columns[0].width = Inches(6.8)
    cell = table.cell(0, 0)
    set_cell_background(cell, fill_hex)
    set_cell_margins(cell, top=120, bottom=120, left=180, right=180)
    
    # Left border only
    tcPr = cell._element.get_or_add_tcPr()
    borders = parse_xml(f'''
        <w:tcBorders {nsdecls("w")}>
            <w:left w:val="single" w:sz="24" w:space="0" w:color="{border_color}"/>
            <w:top w:val="none"/>
            <w:right w:val="none"/>
            <w:bottom w:val="none"/>
        </w:tcBorders>
    ''')
    tcPr.append(borders)
    
    p = cell.paragraphs[0]
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(2)
    p.paragraph_format.line_spacing = 1.15
    run_pre = p.add_run(text_prefix + " ")
    run_pre.bold = True
    run_pre.font.size = Pt(9.5)
    run_pre.font.color.rgb = RGBColor(13, 126, 225) if border_color == "0D7EE1" else RGBColor(225, 29, 72)
    
    run_body = p.add_run(text_body)
    run_body.font.size = Pt(9.5)
    run_body.font.color.rgb = COLOR_DARK
    doc.add_paragraph().paragraph_format.space_after = Pt(4)

def build_docx():
    doc = docx.Document()
    
    # Configure Page Setup to FOLIO (8.5 x 13 inches)
    section = doc.sections[0]
    section.page_width = Inches(8.5)
    section.page_height = Inches(13.0)
    section.top_margin = Inches(0.8)
    section.bottom_margin = Inches(0.8)
    section.left_margin = Inches(0.85)
    section.right_margin = Inches(0.85)
    
    # Header & Footer setup
    header = section.header
    hp = header.paragraphs[0]
    hp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    if os.path.exists(LOGO_ENHANCED):
        hrun_logo = hp.add_run()
        hrun_logo.add_picture(LOGO_ENHANCED, width=Inches(0.4))
    hrun_text = hp.add_run("   VoltWise Energy Monitor · User Manual")
    hrun_text.font.size = Pt(8.5)
    hrun_text.font.color.rgb = COLOR_MUTED
    
    footer = section.footer
    fp = footer.paragraphs[0]
    fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    frun = fp.add_run("VoltWise Systems — Confidential & Proprietary for Homeowners · Folio Format (8.5\" × 13\")")
    frun.font.size = Pt(8.5)
    frun.font.color.rgb = COLOR_MUTED
    
    # ------------------ COVER PAGE ------------------
    cover_spacing = doc.add_paragraph()
    cover_spacing.paragraph_format.space_before = Pt(80)
    
    if os.path.exists(LOGO_COMPLETE):
        p_logo = doc.add_paragraph()
        p_logo.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p_logo.paragraph_format.space_after = Pt(36)
        p_logo.add_run().add_picture(LOGO_COMPLETE, width=Inches(3.4))
        
    p_title = doc.add_paragraph()
    p_title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_title.paragraph_format.space_after = Pt(6)
    r_title = p_title.add_run("USER MANUAL & OPERATING GUIDE")
    r_title.bold = True
    r_title.font.size = Pt(24)
    r_title.font.color.rgb = COLOR_DARK
    
    p_sub = doc.add_paragraph()
    p_sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_sub.paragraph_format.space_after = Pt(30)
    r_sub = p_sub.add_run("Smart Home Energy Monitoring & Automated Circuit Protection System")
    r_sub.font.size = Pt(13)
    r_sub.font.color.rgb = COLOR_PRIMARY
    
    # Minimalist metadata box
    meta_table = doc.add_table(rows=4, cols=2)
    meta_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    meta_data = [
        ("Target Platform:", "VoltWise Android App (APK) & Web Portal"),
        ("System Architecture:", "ESP32 IoT Node + PZEM-004T + Staggered Dual Relays"),
        ("Documentation Standard:", "Minimalist Folio (8.5\" × 13\") · Verified Captures"),
        ("Official Portal:", "https://voltwise-orcin.vercel.app/")
    ]
    for row_idx, (k, v) in enumerate(meta_data):
        c0 = meta_table.cell(row_idx, 0)
        c1 = meta_table.cell(row_idx, 1)
        c0.width = Inches(2.2)
        c1.width = Inches(4.2)
        set_cell_background(c0, "F8FAFC")
        set_cell_background(c1, "FFFFFF")
        set_cell_margins(c0, 60, 60, 100, 100)
        set_cell_margins(c1, 60, 60, 100, 100)
        
        p0 = c0.paragraphs[0]
        r0 = p0.add_run(k)
        r0.bold = True
        r0.font.size = Pt(9.5)
        r0.font.color.rgb = COLOR_DARK
        
        p1 = c1.paragraphs[0]
        r1 = p1.add_run(v)
        r1.font.size = Pt(9.5)
        r1.font.color.rgb = COLOR_MUTED
        
    doc.add_page_break()
    
    # ------------------ CHAPTERS DATA ------------------
    import sys
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from manual_content import CHAPTERS
    chapters = CHAPTERS
    
    for ch in chapters:
        # Chapter Heading
        p_ch = doc.add_paragraph()
        p_ch.paragraph_format.space_before = Pt(18)
        p_ch.paragraph_format.space_after = Pt(2)
        r_num = p_ch.add_run(f"CHAPTER {ch['num']} · ")
        r_num.bold = True
        r_num.font.size = Pt(10)
        r_num.font.color.rgb = COLOR_PRIMARY
        
        r_title = p_ch.add_run(ch["title"])
        r_title.bold = True
        r_title.font.size = Pt(15)
        r_title.font.color.rgb = COLOR_DARK
        
        # Metadata banner table
        meta_tbl = doc.add_table(rows=1, cols=3)
        meta_tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
        meta_tbl.columns[0].width = Inches(2.3)
        meta_tbl.columns[1].width = Inches(3.0)
        meta_tbl.columns[2].width = Inches(1.5)
        
        cell_who = meta_tbl.cell(0, 0)
        cell_req = meta_tbl.cell(0, 1)
        cell_time = meta_tbl.cell(0, 2)
        for c in (cell_who, cell_req, cell_time):
            set_cell_background(c, "F8FAFC")
            set_cell_margins(c, top=60, bottom=60, left=80, right=80)
            
        p = cell_who.paragraphs[0]
        r1 = p.add_run("Who: ")
        r1.bold = True
        r1.font.size = Pt(8.5)
        r1.font.color.rgb = COLOR_PRIMARY
        r2 = p.add_run(ch["who"])
        r2.font.size = Pt(8.5)
        r2.font.color.rgb = COLOR_DARK
        
        p = cell_req.paragraphs[0]
        r1 = p.add_run("Prerequisites: ")
        r1.bold = True
        r1.font.size = Pt(8.5)
        r1.font.color.rgb = COLOR_PRIMARY
        r2 = p.add_run(ch["prereq"])
        r2.font.size = Pt(8.5)
        r2.font.color.rgb = COLOR_DARK
        
        p = cell_time.paragraphs[0]
        r1 = p.add_run("Duration: ")
        r1.bold = True
        r1.font.size = Pt(8.5)
        r1.font.color.rgb = COLOR_PRIMARY
        r2 = p.add_run(ch["time"])
        r2.font.size = Pt(8.5)
        r2.font.color.rgb = COLOR_DARK
        
        # Summary description
        p_desc = doc.add_paragraph()
        p_desc.paragraph_format.space_before = Pt(8)
        p_desc.paragraph_format.space_after = Pt(10)
        r_desc = p_desc.add_run(ch["desc"])
        r_desc.font.size = Pt(10)
        r_desc.font.color.rgb = COLOR_DARK
        
        # Steps
        p_steps_h = doc.add_paragraph()
        p_steps_h.paragraph_format.space_after = Pt(6)
        r_sh = p_steps_h.add_run("Actionable Steps")
        r_sh.bold = True
        r_sh.font.size = Pt(11)
        r_sh.font.color.rgb = COLOR_DARK
        
        for idx, (st_text, img_path, caption, expected) in enumerate(ch["steps"], start=1):
            p_st = doc.add_paragraph()
            p_st.paragraph_format.space_before = Pt(4)
            p_st.paragraph_format.space_after = Pt(4)
            r_idx = p_st.add_run(f"Step {idx}. ")
            r_idx.bold = True
            r_idx.font.size = Pt(10)
            r_idx.font.color.rgb = COLOR_PRIMARY
            
            r_txt = p_st.add_run(st_text)
            r_txt.font.size = Pt(10)
            r_txt.font.color.rgb = COLOR_DARK
            
            # Embed image if available
            if img_path and os.path.exists(img_path):
                p_img = doc.add_paragraph()
                p_img.alignment = WD_ALIGN_PARAGRAPH.CENTER
                p_img.paragraph_format.space_before = Pt(4)
                p_img.paragraph_format.space_after = Pt(3)
                
                # Check aspect ratio
                try:
                    from PIL import Image as PILImage
                    with PILImage.open(img_path) as im:
                        w, h = im.size
                        if w > h:
                            # Wide screenshot
                            p_img.add_run().add_picture(img_path, width=Inches(4.8))
                        else:
                            # Mobile portrait screenshot
                            p_img.add_run().add_picture(img_path, width=Inches(2.2))
                except Exception:
                    p_img.add_run().add_picture(img_path, width=Inches(3.2))
                    
                if caption:
                    p_cap = doc.add_paragraph()
                    p_cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    p_cap.paragraph_format.space_after = Pt(4)
                    rcap = p_cap.add_run(caption)
                    rcap.italic = True
                    rcap.font.size = Pt(8.5)
                    rcap.font.color.rgb = COLOR_MUTED
                    
            if expected:
                add_callout(doc, "You should see:", expected, fill_hex="F0F7FF", border_color="0D7EE1")
                
        # Troubleshooting section
        if ch.get("troubleshoot"):
            p_tr_h = doc.add_paragraph()
            p_tr_h.paragraph_format.space_before = Pt(8)
            p_tr_h.paragraph_format.space_after = Pt(4)
            r_trh = p_tr_h.add_run("Troubleshooting & Failure Modes")
            r_trh.bold = True
            r_trh.font.size = Pt(10.5)
            r_trh.font.color.rgb = RGBColor(225, 29, 72)
            
            tr_tbl = doc.add_table(rows=len(ch["troubleshoot"]) + 1, cols=2)
            tr_tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
            tr_tbl.columns[0].width = Inches(2.6)
            tr_tbl.columns[1].width = Inches(4.2)
            
            # Header row
            h0 = tr_tbl.cell(0, 0)
            h1 = tr_tbl.cell(0, 1)
            set_cell_background(h0, "FFF1F2")
            set_cell_background(h1, "FFF1F2")
            set_cell_margins(h0, 60, 60, 80, 80)
            set_cell_margins(h1, 60, 60, 80, 80)
            
            r = h0.paragraphs[0].add_run("Symptom / Problem")
            r.bold = True
            r.font.size = Pt(8.5)
            r.font.color.rgb = RGBColor(225, 29, 72)
            
            r = h1.paragraphs[0].add_run("Recommended Action")
            r.bold = True
            r.font.size = Pt(8.5)
            r.font.color.rgb = RGBColor(225, 29, 72)
            
            for tr_idx, (symp, act) in enumerate(ch["troubleshoot"], start=1):
                c0 = tr_tbl.cell(tr_idx, 0)
                c1 = tr_tbl.cell(tr_idx, 1)
                set_cell_background(c0, "FAFAFA")
                set_cell_background(c1, "FFFFFF")
                set_cell_margins(c0, 50, 50, 80, 80)
                set_cell_margins(c1, 50, 50, 80, 80)
                
                r = c0.paragraphs[0].add_run(symp)
                r.bold = True
                r.font.size = Pt(8.5)
                r.font.color.rgb = COLOR_DARK
                
                r = c1.paragraphs[0].add_run(act)
                r.font.size = Pt(8.5)
                r.font.color.rgb = COLOR_DARK
                
        doc.add_page_break()
        
    os.makedirs(os.path.dirname(DOCX_PATH), exist_ok=True)
    doc.save(DOCX_PATH)
    print(f"Generated Folio DOCX successfully at: {DOCX_PATH}")

if __name__ == "__main__":
    build_docx()
