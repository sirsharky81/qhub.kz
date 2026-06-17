"use client";

import type { QrFormData } from "@/lib/qr-generator/types";
import { PHONE_PLACEHOLDER } from "@/lib/qr-generator/constants";
import {
  isValidE164,
  isValidLatitude,
  isValidLongitude,
} from "@/lib/qr-generator/qrUtils";
import { useQrTranslations } from "@/lib/qr-generator/i18n";
import { FormField, inputClass, textareaClass } from "./FormField";
import { PaymentDetailsForm } from "./PaymentDetailsForm";
import { VCardForm } from "./VCardForm";
import { WifiForm } from "./WifiForm";
import { StorageForm } from "./StorageForm";
import { InventoryForm } from "./InventoryForm";

interface TypeFormProps {
  form: QrFormData;
  onChange: (form: QrFormData) => void;
  miniLabel?: boolean;
}

export function TypeForm({ form, onChange, miniLabel }: TypeFormProps) {
  const { t } = useQrTranslations();

  switch (form.type) {
    case "text":
      return (
        <FormField label={t("content")}>
          <textarea
            className={textareaClass}
            value={form.data.content}
            onChange={(e) =>
              onChange({ type: "text", data: { content: e.target.value } })
            }
            placeholder="https://qhub.kz"
          />
        </FormField>
      );

    case "payment":
      return (
        <PaymentDetailsForm
          data={form.data}
          onChange={(data) => onChange({ type: "payment", data })}
        />
      );

    case "vcard":
      return (
        <VCardForm data={form.data} onChange={(data) => onChange({ type: "vcard", data })} />
      );

    case "wifi":
      return (
        <WifiForm data={form.data} onChange={(data) => onChange({ type: "wifi", data })} />
      );

    case "whatsapp": {
      const phoneError =
        form.data.phone && !isValidE164(form.data.phone) ? t("invalidPhone") : null;
      return (
        <div className="space-y-3">
          <FormField label={t("phone")} error={phoneError}>
            <input
              className={inputClass}
              value={form.data.phone}
              onChange={(e) =>
                onChange({
                  type: "whatsapp",
                  data: { ...form.data, phone: e.target.value },
                })
              }
              placeholder={PHONE_PLACEHOLDER}
            />
          </FormField>
          <FormField label={t("message")}>
            <textarea
              className={textareaClass}
              value={form.data.message}
              onChange={(e) =>
                onChange({
                  type: "whatsapp",
                  data: { ...form.data, message: e.target.value },
                })
              }
            />
          </FormField>
        </div>
      );
    }

    case "telegram":
      return (
        <FormField label={t("username")}>
          <input
            className={inputClass}
            value={form.data.username}
            onChange={(e) =>
              onChange({
                type: "telegram",
                data: { username: e.target.value },
              })
            }
            placeholder="@username"
          />
        </FormField>
      );

    case "phone": {
      const phoneError =
        form.data.phone && !isValidE164(form.data.phone) ? t("invalidPhone") : null;
      return (
        <FormField label={t("phone")} error={phoneError}>
          <input
            className={inputClass}
            value={form.data.phone}
            onChange={(e) =>
              onChange({ type: "phone", data: { phone: e.target.value } })
            }
            placeholder={PHONE_PLACEHOLDER}
          />
        </FormField>
      );
    }

    case "email":
      return (
        <div className="space-y-3">
          <FormField label={t("email")}>
            <input
              className={inputClass}
              type="email"
              value={form.data.email}
              onChange={(e) =>
                onChange({
                  type: "email",
                  data: { ...form.data, email: e.target.value },
                })
              }
            />
          </FormField>
          <FormField label={t("subject")}>
            <input
              className={inputClass}
              value={form.data.subject}
              onChange={(e) =>
                onChange({
                  type: "email",
                  data: { ...form.data, subject: e.target.value },
                })
              }
            />
          </FormField>
          <FormField label={t("body")}>
            <textarea
              className={textareaClass}
              value={form.data.body}
              onChange={(e) =>
                onChange({
                  type: "email",
                  data: { ...form.data, body: e.target.value },
                })
              }
            />
          </FormField>
        </div>
      );

    case "geo": {
      const latError =
        form.data.latitude && !isValidLatitude(form.data.latitude)
          ? t("invalidLat")
          : null;
      const lngError =
        form.data.longitude && !isValidLongitude(form.data.longitude)
          ? t("invalidLng")
          : null;
      return (
        <div className="space-y-3">
          <FormField label={t("latitude")} error={latError}>
            <input
              className={inputClass}
              value={form.data.latitude}
              onChange={(e) =>
                onChange({
                  type: "geo",
                  data: { ...form.data, latitude: e.target.value },
                })
              }
              placeholder="43.238949"
            />
          </FormField>
          <FormField label={t("longitude")} error={lngError}>
            <input
              className={inputClass}
              value={form.data.longitude}
              onChange={(e) =>
                onChange({
                  type: "geo",
                  data: { ...form.data, longitude: e.target.value },
                })
              }
              placeholder="76.889709"
            />
          </FormField>
        </div>
      );
    }

    case "event":
      return (
        <div className="space-y-3">
          <FormField label={t("eventTitle")}>
            <input
              className={inputClass}
              value={form.data.title}
              onChange={(e) =>
                onChange({
                  type: "event",
                  data: { ...form.data, title: e.target.value },
                })
              }
            />
          </FormField>
          <FormField label={t("location")}>
            <input
              className={inputClass}
              value={form.data.location}
              onChange={(e) =>
                onChange({
                  type: "event",
                  data: { ...form.data, location: e.target.value },
                })
              }
            />
          </FormField>
          <FormField label={t("start")}>
            <input
              className={inputClass}
              type="datetime-local"
              value={form.data.start}
              onChange={(e) =>
                onChange({
                  type: "event",
                  data: { ...form.data, start: e.target.value },
                })
              }
            />
          </FormField>
          <FormField label={t("end")}>
            <input
              className={inputClass}
              type="datetime-local"
              value={form.data.end}
              onChange={(e) =>
                onChange({
                  type: "event",
                  data: { ...form.data, end: e.target.value },
                })
              }
            />
          </FormField>
          <FormField label={t("description")}>
            <textarea
              className={textareaClass}
              value={form.data.description}
              onChange={(e) =>
                onChange({
                  type: "event",
                  data: { ...form.data, description: e.target.value },
                })
              }
            />
          </FormField>
        </div>
      );

    case "storage":
      return (
        <StorageForm
          data={form.data}
          onChange={(data) => onChange({ type: "storage", data })}
          miniLabel={miniLabel}
        />
      );

    case "inventory":
      return (
        <InventoryForm
          data={form.data}
          onChange={(data) => onChange({ type: "inventory", data })}
          miniLabel={miniLabel}
        />
      );
  }
}
