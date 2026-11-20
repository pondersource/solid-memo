// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useState } from "preact/hooks";
import type { RegistrationOptions, RegistrationTarget } from "@solid-memo/domain/instance";
import type { Storage } from "@solid-memo/domain/storage";
import { isModuleStorage } from "./moduleStorage";
import { ErrorMessage } from "./ErrorMessage";
import { useI18n, type ErrorText } from "./i18n";
import { RegistrationTargetChooser } from "./RegistrationTargetChooser";

export function InstanceCreator({
  storage,
  options,
  busy,
  error,
  onCreate,
  backHref,
}: {
  storage: Storage;
  options: RegistrationOptions | null;
  busy: boolean;
  error: ErrorText | null;
  onCreate: (args: {
    containerUrl: string;
    name: string;
    registrationTarget: RegistrationTarget;
  }) => void;
  /** URL of the instance picker, where Back goes. */
  backHref: string;
}) {
  const { t } = useI18n();
  const moduleStorage = isModuleStorage(storage.url);
  const [name, setName] = useState("");
  const [containerUrl, setContainerUrl] = useState(`${storage.url}solid-memo/main/`);
  const [target, setTarget] = useState<RegistrationTarget>("private");

  function handleSubmit(event: Event) {
    event.preventDefault();
    onCreate({
      containerUrl: containerUrl.trim(),
      name: name.trim(),
      registrationTarget: target,
    });
  }

  return (
    <section>
      <h2>{t("instanceCreator.heading")}</h2>
      {/* First-time users land here without passing the picker, so the
          definition of an instance is repeated. */}
      <p class="hint">{t("instancePicker.intro")}</p>
      <form onSubmit={handleSubmit}>
        <label for="instance-name">{t("instanceCreator.name")}</label>
        <input
          id="instance-name"
          type="text"
          placeholder={t("instanceCreator.namePlaceholder")}
          value={name}
          onInput={(e) => setName(e.currentTarget.value)}
          required
          disabled={busy}
        />
        <label for="instance-container">
          {moduleStorage ? "Folder" : t("instanceCreator.location")}
        </label>
        <input
          id="instance-container"
          {...(moduleStorage ? { type: "text" as const } : { type: "url" as const })}
          aria-describedby="instance-container-hint"
          value={moduleStorage ? containerUrl.slice(storage.url.length) : containerUrl}
          onInput={(e) =>
            setContainerUrl((moduleStorage ? storage.url : "") + e.currentTarget.value)
          }
          required
          disabled={busy}
        />
        <span id="instance-container-hint" class="hint">
          {moduleStorage
            ? "A folder in your connected storage."
            : t("instanceCreator.locationHint")}
        </span>
        <RegistrationTargetChooser options={options} value={target} onChange={setTarget} />
        <button type="submit" disabled={busy}>
          {t("instanceCreator.create")}
        </button>
        <a class="button" href={backHref}>
          {t("instanceCreator.back")}
        </a>
      </form>
      <ErrorMessage error={error} />
    </section>
  );
}
