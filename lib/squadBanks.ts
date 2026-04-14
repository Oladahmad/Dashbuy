export type SquadBank = {
  code: string;
  name: string;
  aliases?: string[];
};

export const SQUAD_BANKS: SquadBank[] = [
  { code: "000014", name: "Access Bank", aliases: ["access", "access bank plc"] },
  { code: "000010", name: "Ecobank Bank", aliases: ["ecobank", "ecobank nigeria"] },
  { code: "000003", name: "FCMB", aliases: ["first city monument bank", "fcmb bank"] },
  { code: "000007", name: "Fidelity Bank", aliases: ["fidelity"] },
  { code: "000016", name: "First Bank of Nigeria", aliases: ["first bank", "first bank nigeria", "fbn"] },
  { code: "000013", name: "GTBank Plc", aliases: ["gtbank", "guaranty trust bank", "gtb", "guaranty trust bank plc"] },
  { code: "000002", name: "Keystone Bank", aliases: ["keystone"] },
  { code: "000008", name: "Polaris Bank", aliases: ["polaris"] },
  { code: "000023", name: "Providus Bank", aliases: ["providus"] },
  { code: "000001", name: "Sterling Bank", aliases: ["sterling"] },
  { code: "000012", name: "StanbicIBTC Bank", aliases: ["stanbic", "stanbic ibtc", "stanbicibtc"] },
  { code: "000025", name: "Titan Trust Bank", aliases: ["titan", "titan trust"] },
  { code: "000004", name: "United Bank for Africa", aliases: ["uba", "united bank for africa plc"] },
  { code: "000018", name: "Union Bank", aliases: ["union"] },
  { code: "000017", name: "Wema Bank", aliases: ["wema"] },
  { code: "000015", name: "Zenith Bank Plc", aliases: ["zenith", "zenith bank"] },
  { code: "090267", name: "Kuda Microfinance Bank", aliases: ["kuda", "kuda bank"] },
  { code: "100004", name: "Opay Digital Services LTD", aliases: ["opay", "opay digital services"] },
  { code: "100033", name: "PalmPay Limited", aliases: ["palmpay", "palm pay"] },
  { code: "090551", name: "FairMoney Microfinance Bank", aliases: ["fairmoney", "fairmoney bank"] },
  { code: "090405", name: "Moniepoint MFB", aliases: ["moniepoint", "moniepoint mfb", "teamapt", "moniepoint microfinance bank"] },
  { code: "000024", name: "Rand Merchant Bank", aliases: ["rmb", "rand merchant"] },
  { code: "000031", name: "Premium Trust Bank", aliases: ["premium trust", "premiumtrust"] },
  { code: "000027", name: "Globus Bank", aliases: ["globus"] },
];

function normalize(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function findSquadBankByName(bankName: string | null | undefined) {
  const needle = normalize(String(bankName ?? ""));
  if (!needle) return null;
  return (
    SQUAD_BANKS.find((bank) => {
      if (normalize(bank.name) === needle) return true;
      return (bank.aliases ?? []).some((alias) => normalize(alias) === needle);
    }) ?? null
  );
}
