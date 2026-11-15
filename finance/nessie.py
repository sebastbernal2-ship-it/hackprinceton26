"""Adapter for a Nessie-shaped banking sandbox. EVERY record is tagged SIMULATED.

Nessie is Capital One's hackathon "mock bank" API (api.nessieisreal.com; key passed as ?key=...; resources:
customers, accounts, deposits, purchases, merchants, loans, bills, transfers). Field names below follow that data
model as recalled from third-party SDK docs; the official docs could NOT be fetched in this session (403), so the
live HTTP client is UNVERIFIED and untested. LocalSandbox implements the same calls in memory and is what runs by
default; it is a local stand-in, NOT Capital One's service. No key is invented or stored here."""
from __future__ import annotations

import itertools
import json
import os
import urllib.request
from datetime import date, timedelta

TAG = "SIMULATED"


class LocalSandbox:
    """In-memory Nessie-shaped store (LOCAL SANDBOX)."""
    kind = "local-sandbox"

    def __init__(self):
        self.t = {k: [] for k in ("customers", "accounts", "deposits", "purchases", "merchants", "loans", "bills")}
        self._id = itertools.count(1)

    def _add(self, table, rec):
        rec = {"_id": f"local-{table}-{next(self._id)}", **rec, "simulated": True}
        self.t[table].append(rec)
        return rec

    def create_customer(self, d): return self._add("customers", d)
    def create_account(self, cid, d): return self._add("accounts", {**d, "customer_id": cid})
    def create_merchant(self, d): return self._add("merchants", d)
    def create_loan(self, aid, d): return self._add("loans", {**d, "account_id": aid})
    def create_bill(self, aid, d): return self._add("bills", {**d, "account_id": aid})
    def create_deposit(self, aid, d): return self._add("deposits", {**d, "account_id": aid})
    def create_purchase(self, aid, d): return self._add("purchases", {**d, "account_id": aid})


class NessieHttp:
    """UNVERIFIED live client (never exercised: no key available). Key is read from NESSIE_API_KEY by name only."""
    kind = "nessie-http"
    BASE = "http://api.nessieisreal.com"

    def __init__(self, key: str | None = None):
        self.key = key or os.environ.get("NESSIE_API_KEY")
        if not self.key:
            raise RuntimeError("NESSIE_API_KEY not set")

    def _post(self, path, body):
        req = urllib.request.Request(f"{self.BASE}{path}?key={self.key}", json.dumps(body).encode(),
                                     {"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=20) as r:
            j = json.loads(r.read())
        return j.get("objectCreated", j)

    def create_customer(self, d): return self._post("/customers", d)
    def create_account(self, cid, d): return self._post(f"/customers/{cid}/accounts", d)
    def create_merchant(self, d): return self._post("/merchants", d)
    def create_loan(self, aid, d): return self._post(f"/accounts/{aid}/loans", d)
    def create_bill(self, aid, d): return self._post(f"/accounts/{aid}/bills", d)
    def create_deposit(self, aid, d): return self._post(f"/accounts/{aid}/deposits", d)
    def create_purchase(self, aid, d): return self._post(f"/accounts/{aid}/purchases", d)


def _add_months(d: date, k: int) -> date:
    y, m = divmod(d.month - 1 + k, 12)
    return date(d.year + y, m + 1, 1)


def post_trail(client, path: dict, open_days: float, start: date = date(2027, 1, 1), months: int = 36, seed_days: int = 26) -> dict:
    """Push the simulated life of the restaurant into `client` and return summary + records.
    path: output of model.representative_path. Daily sales -> deposits; COGS -> weekly supplier purchases;
    rent/utilities -> bills and purchases; build-out loan -> loan record plus a loan-proceeds deposit."""
    tag = f"{TAG}: "
    cust = client.create_customer({"first_name": "SIMULATED", "last_name": "Restaurant LLC",
                                  "address": {"street_number": "0", "street_name": "SIMULATED", "city": "N/A", "state": "NJ", "zip": "00000"}})
    acct = client.create_account(cust["_id"], {"type": "Checking", "nickname": tag + "operating account", "rewards": 0, "balance": 0})
    cid, aid = cust["_id"], acct["_id"]
    sup = client.create_merchant({"name": tag + "food supplier", "category": ["food"]})
    lld = client.create_merchant({"name": tag + "landlord", "category": ["rent"]})
    utl = client.create_merchant({"name": tag + "utilities", "category": ["utilities"]})
    wrk = client.create_merchant({"name": tag + "payroll", "category": ["payroll"]})
    bank = client.create_merchant({"name": tag + "lender (loan servicing)", "category": ["loan"]})
    t = path["terms"]
    client.create_loan(aid, {"type": "small business", "status": "approved", "credit_score": 0,
                             "monthly_payment": round(path["pmt"], 2), "amount": round(path["principal"], 2),
                             "description": tag + f"build-out loan {t['name']} rate={t['annualRate']} term={t['termMonths']}m (ASSUMED)"})
    client.create_deposit(aid, {"medium": "balance", "transaction_date": start.isoformat(), "amount": round(path["principal"], 2),
                                "status": "executed", "description": tag + "loan proceeds"})
    n = 0
    for mi in range(months):
        m0 = _add_months(start, mi)
        rent, util, pay = float(path["rent"][mi]), float(path["util"][mi]), float(path["pmt"])
        client.create_bill(aid, {"status": "pending", "payee": tag + "landlord", "nickname": tag + f"rent m{mi+1}",
                                 "payment_date": m0.isoformat(), "recurring_date": 1, "payment_amount": round(rent, 2)})
        client.create_bill(aid, {"status": "pending", "payee": tag + "utilities", "nickname": tag + f"utilities m{mi+1}",
                                 "payment_date": (m0 + timedelta(days=4)).isoformat(), "recurring_date": 5, "payment_amount": round(util, 2)})
        client.create_purchase(aid, {"merchant_id": lld["_id"], "medium": "balance", "purchase_date": m0.isoformat(),
                                     "amount": round(rent, 2), "status": "executed", "description": tag + f"rent m{mi+1}"})
        client.create_purchase(aid, {"merchant_id": utl["_id"], "medium": "balance", "purchase_date": (m0 + timedelta(days=4)).isoformat(),
                                     "amount": round(util, 2), "status": "executed", "description": tag + f"utilities m{mi+1}"})
        client.create_purchase(aid, {"merchant_id": wrk["_id"], "medium": "balance", "purchase_date": (m0 + timedelta(days=14)).isoformat(),
                                     "amount": round(float(path["labor"][mi]), 2), "status": "executed", "description": tag + f"payroll m{mi+1}"})
        client.create_purchase(aid, {"merchant_id": bank["_id"], "medium": "balance", "purchase_date": (m0 + timedelta(days=27)).isoformat(),
                                     "amount": round(pay, 2), "status": "executed", "description": tag + f"loan payment m{mi+1} (debt service)"})
        days = [m0 + timedelta(days=k) for k in range(28)]
        days = [x for x in days if x.weekday() != 0][:int(open_days)]  # closed Mondays
        w = [1.4 if x.weekday() >= 4 else 1.0 for x in days]
        sales = float(path["sales"][mi])
        for x, wi in zip(days, w):
            client.create_deposit(aid, {"medium": "balance", "transaction_date": x.isoformat(), "status": "executed",
                                        "amount": round(sales * wi / sum(w), 2), "description": tag + "daily sales"})
        for wk in range(4):
            client.create_purchase(aid, {"merchant_id": sup["_id"], "medium": "balance", "status": "executed",
                                         "purchase_date": (m0 + timedelta(days=wk * 7 + 2)).isoformat(),
                                         "amount": round(float(path["cogs"][mi]) / 4, 2), "description": tag + "supplier purchase"})
        n += 1
    return {"customerId": cid, "accountId": aid, "months": n}
