"""
Synthetic ACORD 25 COI Generator — Real Template Edition

Uses a real blank ACORD 25 form (rasterized from PDF) as the base template.
Fills fields with randomized data, applies composite distortions, and
outputs Gemini supervised fine-tuning JSONL format.

Usage:
  1. Convert blank PDF to PNG first:
     python -c "import fitz; doc=fitz.open('ACORD 25 fillable.pdf'); doc[0].get_pixmap(dpi=200).save('blank_acord25.png')"
  2. Generate dataset:
     python generate_synthetic_coi.py --count 1000 --split

Requirements:
  pip install Pillow opencv-python-headless numpy PyMuPDF
"""

import argparse
import io
import json
import os
import random
import sys
from base64 import b64encode
from dataclasses import dataclass
from datetime import date, timedelta

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance

try:
    import cv2
except ImportError:
    print("ERROR: opencv-python-headless required. Run: pip install opencv-python-headless")
    sys.exit(1)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

BLANK_TEMPLATE = "training/blank_acord25.png"
OUTPUT_DIR = "synthetic_images"
OUTPUT_RESOLUTION = (672, 672)

# ACORD 25 field positions (pixels at 1700x2200, 200 DPI)
FIELDS = {
    "producer_name":       (110, 285, 780),
    "producer_addr1":      (110, 318, 780),
    "producer_city":       (110, 350, 780),
    "insured_name":        (110, 452, 780),
    "insured_addr1":       (110, 485, 780),
    "insurer_a":           (110, 582, 780),
    "insurer_b":           (110, 622, 780),
    "policy_number":       (110, 732, 500),
    "effective_date":      (680, 732, 282),
    "expiration_date":     (965, 732, 282),
    "gl_aggregate":        (1180, 772, 420),
    "gl_each_occurrence":  (1180, 832, 420),
    "damage_rented":       (1180, 872, 420),
    "medical_expense":     (1180, 912, 420),
    "description_line1":   (110, 1058, 1480),
    "description_line2":   (110, 1092, 1480),
    "description_line3":   (110, 1126, 1480),
    "certificate_holder":  (110, 1525, 780),
    "holder_addr1":        (110, 1558, 780),
    "endorsement_date":    (110, 1635, 300),
    "authorized_rep":      (110, 1782, 780),
    "form_date":           (1400, 1940, 260),
}

# Data pools
INSURED_COMPANIES = [
    "Acme Logistics Inc.", "Midwest Freight Solutions LLC", "Bayside Transport Corp.",
    "Pioneer Shipping Group", "Summit Cargo Express", "Atlas Freight Forwarders",
    "Continental Logistics Partners", "Phoenix Supply Chain Ltd.",
    "Iron Gate Distribution", "Cascade Transportation Services",
    "Harbor Freight Management", "Golden State Carriers",
    "Redwood Logistics Inc.", "Blue Ridge Trucking Co.", "Delta Express Freight",
    "Peak Performance Logistics", "Coastal Cargo LLC", "Metro Distribution Services",
]

BROKER_AGENCIES = [
    "Gallagher Risk Solutions", "Aon Risk Services", "Marsh & McLennan Agency",
    "Willis Towers Watson", "Lockton Companies", "Brown & Brown Insurance",
    "HUB International", "USI Insurance Services", "AssuredPartners",
    "AmWINS Group", "CRC Insurance Services", "RT Specialty",
]

INSURERS = [
    "Travelers Indemnity Company", "The Hartford", "Zurich American Insurance Co.",
    "Chubb Ltd.", "Liberty Mutual Insurance", "AIG Property Casualty",
    "Berkshire Hathaway Specialty Ins.", "CNA Financial", "XL Catlin",
    "Great American Insurance Co.", "Markel Corporation", "AXA XL",
]

COVERAGE_LIMITS = {
    "gl_aggregate":          ["$2,000,000", "$4,000,000", "$5,000,000", "$1,000,000", "$3,000,000"],
    "gl_each_occurrence":    ["$1,000,000", "$2,000,000", "$1,500,000", "$3,000,000", "$5,000,000"],
    "damage_rented":         ["$100,000", "$250,000", "$500,000", "$1,000,000", "$300,000"],
    "medical_expense":       ["$5,000", "$10,000", "$15,000", "$25,000"],
}

CERTIFICATE_HOLDERS = [
    "Amazon Logistics Inc.", "Walmart Transportation LLC", "Target Supply Chain",
    "Home Depot Logistics", "FedEx Ground", "UPS Supply Chain Solutions",
    "DHL Global Forwarding", "XPO Logistics", "JB Hunt Transport",
    "Schneider National", "C.H. Robinson", "Coyote Logistics",
    "Echo Global Logistics", "TQL - Total Quality Logistics",
    "Ryder Integrated Logistics", "Penske Logistics",
]

STAMP_TEXTS = ["RECEIVED", "CERTIFIED COPY", "VOID IF ALTERED", "ORIGINAL", "DUPLICATE"]
HANDWRITING_PHRASES = ["", "", "", "See attached waiver", "Waiver of subrogation applies",
                        "BLANKET ADDITIONAL INSURED", "Subject to inspection", "", "", ""]


@dataclass
class COIData:
    producer_name: str
    producer_addr1: str
    producer_city: str
    insured_name: str
    insured_addr1: str
    insurer_a: str
    insurer_b: str
    policy_number: str
    effective_date: str
    expiration_date: str
    gl_aggregate: str
    gl_each_occurrence: str
    damage_rented: str
    medical_expense: str
    description_line1: str
    description_line2: str
    description_line3: str
    certificate_holder: str
    holder_addr1: str
    endorsement_date: str
    authorized_rep: str
    form_date: str
    broker_name: str
    handwritten: str


def random_date(start: date, end: date) -> date:
    return start + timedelta(days=random.randint(0, (end - start).days))


def generate_coi_data() -> COIData:
    eff_date = random_date(date(2020, 1, 1), date(2026, 6, 1))
    exp_date = eff_date + timedelta(days=365 + random.randint(-20, 40))
    end_date = eff_date + timedelta(days=random.randint(15, 180))
    broker = random.choice(BROKER_AGENCIES)
    handwritten = random.choice(HANDWRITING_PHRASES)
    if random.random() < 0.25 and handwritten:
        handwritten = handwritten + "\n" + random.choice(STAMP_TEXTS)

    return COIData(
        producer_name=broker,
        producer_addr1=f"{random.randint(100,9999)} {random.choice(['Commerce','Industrial','Freight','Trade','Enterprise'])} {random.choice(['Blvd','Dr','Way','Ave','Pkwy'])}",
        producer_city=f"{random.choice(['Chicago','Dallas','Atlanta','Phoenix','Denver','Memphis','Indianapolis','Kansas City','Nashville','Charlotte'])}, {random.choice(['IL','TX','GA','AZ','CO','TN','IN','MO','NC'])} {random.randint(10000,99999)}",
        insured_name=random.choice(INSURED_COMPANIES),
        insured_addr1=f"{random.randint(100,9999)} {random.choice(['Logistics','Shipping','Transport','Cargo','Supply Chain'])} {random.choice(['Blvd','Way','Dr','Ave'])}",
        insurer_a=random.choice(INSURERS),
        insurer_b=random.choice(INSURERS) if random.random() < 0.4 else "",
        policy_number=f"CGL-{eff_date.year}-{random.randint(100000,999999):06d}",
        effective_date=eff_date.strftime("%m/%d/%Y"),
        expiration_date=exp_date.strftime("%m/%d/%Y"),
        gl_aggregate=random.choice(COVERAGE_LIMITS["gl_aggregate"]),
        gl_each_occurrence=random.choice(COVERAGE_LIMITS["gl_each_occurrence"]),
        damage_rented=random.choice(COVERAGE_LIMITS["damage_rented"]),
        medical_expense=random.choice(COVERAGE_LIMITS["medical_expense"]),
        description_line1="Freight transportation & logistics services",
        description_line2="including warehousing, cross-docking &",
        description_line3="final mile delivery. All shipments in transit.",
        certificate_holder=random.choice(CERTIFICATE_HOLDERS),
        holder_addr1=f"c/o {random.choice(INSURED_COMPANIES)}",
        endorsement_date=end_date.strftime("%m/%d/%Y"),
        authorized_rep=f"{broker} / Underwriting Dept.",
        form_date=date.today().strftime("%m/%d/%Y"),
        broker_name=broker,
        handwritten=handwritten,
    )


# ---------------------------------------------------------------------------
# Drawing helpers
# ---------------------------------------------------------------------------

def get_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    try:
        if bold: return ImageFont.truetype("arialbd.ttf", size)
        return ImageFont.truetype("arial.ttf", size)
    except OSError:
        return ImageFont.load_default()


def get_handwriting_font(size: int) -> ImageFont.FreeTypeFont:
    try: return ImageFont.truetype("segoesc.ttf", size)
    except OSError: return get_font(size)


def fill_form(template: Image.Image, data: COIData) -> Image.Image:
    """Fill blank ACORD 25 template with randomized data at known coordinates."""
    img = template.copy()
    draw = ImageDraw.Draw(img)
    font = get_font(18)
    hand_font = get_handwriting_font(20)

    fill = {
        "producer_name": data.producer_name,
        "producer_addr1": data.producer_addr1,
        "producer_city": data.producer_city,
        "insured_name": data.insured_name,
        "insured_addr1": data.insured_addr1,
        "insurer_a": data.insurer_a,
        "insurer_b": data.insurer_b or "",
        "policy_number": data.policy_number,
        "effective_date": data.effective_date,
        "expiration_date": data.expiration_date,
        "gl_aggregate": data.gl_aggregate,
        "gl_each_occurrence": data.gl_each_occurrence,
        "damage_rented": data.damage_rented,
        "medical_expense": data.medical_expense,
        "description_line1": data.description_line1,
        "description_line2": data.description_line2,
        "description_line3": data.description_line3,
        "certificate_holder": data.certificate_holder,
        "holder_addr1": data.holder_addr1,
        "endorsement_date": data.endorsement_date,
        "authorized_rep": data.authorized_rep,
        "form_date": data.form_date,
    }

    for key, (x, y, _) in FIELDS.items():
        text = fill.get(key, "")
        if text:
            draw.text((x, y), text, font=font, fill="black")

    # Handwritten annotations
    if data.handwritten:
        for i, line in enumerate(data.handwritten.split("\n")):
            if line.strip():
                hx = random.randint(800, 1500)
                hy = random.randint(1350, 1500) + i * 30
                color = (random.randint(0, 50), random.randint(0, 80), random.randint(150, 255))
                draw.text((hx, hy), line, font=hand_font, fill=color)

    # Red stamp
    if random.random() < 0.35:
        stamp_text = random.choice(STAMP_TEXTS)
        stamp = Image.new("RGBA", (500, 120), (0, 0, 0, 0))
        sd = ImageDraw.Draw(stamp)
        try: sf = ImageFont.truetype("impact.ttf", 48)
        except OSError: sf = get_font(42, bold=True)
        bb = sd.textbbox((0, 0), stamp_text, font=sf)
        tw, th = bb[2] - bb[0], bb[3] - bb[1]
        sd.text(((500 - tw) // 2, (120 - th) // 2), stamp_text, font=sf, fill=(180, 30, 30, 100))
        stamp = stamp.rotate(random.randint(-25, 25), expand=True, resample=Image.BILINEAR)
        img.paste(stamp, (random.randint(600, 1300), random.randint(300, 1000)), stamp)

    return img


# ---------------------------------------------------------------------------
# Distortions
# ---------------------------------------------------------------------------

def apply_distortions(img: Image.Image) -> Image.Image:
    available = ["rotate", "blur", "noise", "brightness", "jpeg", "perspective", "lowres"]
    applied = random.sample(available, random.randint(3, 5))

    for d in applied:
        if d == "rotate":
            img = img.rotate(random.uniform(-4, 4), expand=False, resample=Image.BILINEAR, fillcolor="white")
        elif d == "blur":
            img = img.filter(ImageFilter.GaussianBlur(random.uniform(0.3, 1.2)))
        elif d == "noise":
            arr = np.array(img)
            noise = np.random.normal(0, random.uniform(3, 12), arr.shape).astype(np.int16)
            arr = np.clip(arr.astype(np.int16) + noise, 0, 255).astype(np.uint8)
            img = Image.fromarray(arr)
        elif d == "brightness":
            img = ImageEnhance.Brightness(img).enhance(random.uniform(0.75, 1.25))
            img = ImageEnhance.Contrast(img).enhance(random.uniform(0.8, 1.2))
        elif d == "jpeg":
            buf = io.BytesIO(); img.save(buf, format="JPEG", quality=random.randint(35, 70))
            img = Image.open(buf).convert("RGB")
        elif d == "perspective":
            arr = np.array(img); h, w = arr.shape[:2]; s = random.uniform(5, 25)
            src = np.float32([[0,0],[w-1,0],[0,h-1],[w-1,h-1]])
            dst = np.float32([[random.uniform(0,s),random.uniform(0,s)],
                              [w-1-random.uniform(0,s),random.uniform(0,s)],
                              [random.uniform(0,s),h-1-random.uniform(0,s)],
                              [w-1-random.uniform(0,s),h-1-random.uniform(0,s)]])
            M = cv2.getPerspectiveTransform(src, dst)
            img = Image.fromarray(cv2.warpPerspective(arr, M, (w, h), borderValue=(255,255,255)))
        elif d == "lowres":
            scale = random.uniform(0.35, 0.65); w, h = img.size
            img = img.resize((int(w*scale), int(h*scale)), Image.NEAREST).resize((w, h), Image.BILINEAR)

    return img


# ---------------------------------------------------------------------------
# Gemini Fine-Tuning Format
# ---------------------------------------------------------------------------

SYSTEM_TEXT = """You are a freight document extraction specialist. Extract data from ACORD 25 Certificates of Liability Insurance with high accuracy. Return ONLY valid JSON — no markdown, no commentary.

Rules:
1. Return JSON with exactly the fields listed.
2. If a field is not visible, set its value to null.
3. For currency amounts, extract the plain number without $ or commas (e.g., 1000000 not "$1,000,000").
4. For dates, use YYYY-MM-DD format (convert from MM/DD/YYYY if needed).
5. Preserve exact spelling and capitalization.
6. Include a confidence (0.0-1.0) for each field."""

EXTRACT_PROMPT = """Extract these fields from this ACORD 25 COI. Return JSON only.

Fields:
- insured_name: Named insured company
- policy_number: Policy number
- policy_effective_date: Effective date (YYYY-MM-DD)
- policy_expiration_date: Expiration date (YYYY-MM-DD)
- general_liability_each_occurrence: Each occurrence limit (plain number, no $)
- general_liability_aggregate: General aggregate limit (plain number, no $)
- additional_insured_name: Certificate holder
- additional_insured_endorsement_date: Endorsement date (YYYY-MM-DD)
- broker_name: Producer/broker name
- handwritten_endorsements: Handwritten notes or stamps (null if none)

Return JSON only: {"insured_name":"...", "policy_number":"...", ...}"""


def build_expected(data: COIData) -> str:
    s = lambda x: x.replace("$","").replace(",","").strip()
    iso = lambda m: f"{m[6:]}-{m[:2]}-{m[3:5]}" if len(m.split("/"))==3 else m
    return json.dumps({
        "insured_name": data.insured_name,
        "policy_number": data.policy_number,
        "policy_effective_date": iso(data.effective_date),
        "policy_expiration_date": iso(data.expiration_date),
        "general_liability_each_occurrence": s(data.gl_each_occurrence),
        "general_liability_aggregate": s(data.gl_aggregate),
        "additional_insured_name": data.certificate_holder,
        "additional_insured_endorsement_date": iso(data.endorsement_date),
        "broker_name": data.broker_name,
        "handwritten_endorsements": data.handwritten or None,
    }, ensure_ascii=False)


def to_b64(img: Image.Image) -> str:
    buf = io.BytesIO(); img.save(buf, format="PNG")
    return b64encode(buf.getvalue()).decode("ascii")


def make_line(img: Image.Image, expected: str) -> dict:
    return {
        "systemInstruction": {"parts": [{"text": SYSTEM_TEXT}]},
        "contents": [{"role":"user","parts":[
            {"text": EXTRACT_PROMPT},
            {"inlineData":{"mimeType":"image/png","data":to_b64(img)}},
        ]}],
        "expectedResponse": [{"role":"model","parts":[{"text":expected}]}],
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    p = argparse.ArgumentParser(description="Generate synthetic ACORD 25 COIs from real template.")
    p.add_argument("--count", type=int, default=1000)
    p.add_argument("--output", type=str, default="coi_dataset.jsonl")
    p.add_argument("--images-dir", type=str, default=OUTPUT_DIR)
    p.add_argument("--split", action="store_true")
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--template", type=str, default=BLANK_TEMPLATE)
    p.add_argument("--no-save-images", action="store_true")
    args = p.parse_args()

    random.seed(args.seed); np.random.seed(args.seed)

    if not os.path.exists(args.template):
        print(f"ERROR: Template not found: {args.template}")
        print("Convert first: python -c \"import fitz; doc=fitz.open('training/ACORD 25 fillable.pdf'); doc[0].get_pixmap(dpi=200).save('training/blank_acord25.png')\"")
        sys.exit(1)

    print(f"Loading: {args.template}")
    template = Image.open(args.template).convert("RGB")
    os.makedirs(args.images_dir, exist_ok=True)

    examples = []
    for i in range(args.count):
        data = generate_coi_data()
        img = fill_form(template, data)
        img = apply_distortions(img)
        img = img.resize(OUTPUT_RESOLUTION, Image.LANCZOS)
        if not args.no_save_images:
            img.save(os.path.join(args.images_dir, f"coi_{i:04d}.png"), format="PNG")
        examples.append(make_line(img, build_expected(data)))
        if (i + 1) % 50 == 0:
            print(f"  {i+1}/{args.count}...")

    random.shuffle(examples)

    if args.split:
        n = len(examples); te = int(n*0.70); ve = int(n*0.85)
        for name, sub in [("coi_train.jsonl", examples[:te]), ("coi_val.jsonl", examples[te:ve]), ("coi_test.jsonl", examples[ve:])]:
            with open(name, "w", encoding="utf-8") as f:
                for line in sub: f.write(json.dumps(line, ensure_ascii=False)+"\n")
            print(f"  {name}: {len(sub)} examples")
    else:
        with open(args.output, "w", encoding="utf-8") as f:
            for line in examples: f.write(json.dumps(line, ensure_ascii=False)+"\n")
        print(f"  {args.output}: {len(examples)} examples")

    print(f"\nDone. Next: Upload JSONL to Vertex AI → https://console.cloud.google.com/vertex-ai/studio/tuning")


if __name__ == "__main__":
    main()
