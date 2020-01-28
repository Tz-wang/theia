/********************************************************************************
 * Copyright (C) 2020 Red Hat, Inc. and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { TextEncoder, TextDecoder } from 'util';
import { FileSystemMain } from '../common/plugin-api-rpc';
import { UriComponents } from '../common/uri-components';
import { FileSystem } from './types-impl';

/**
 * This class is managing FileSystem proxy
 */
export class InPluginFileSystemProxy implements FileSystem {

    private proxy: FileSystemMain;

    constructor(proxy: FileSystemMain) {
        this.proxy = proxy;
    }

    async readFile(uri: UriComponents): Promise<Uint8Array> {
        const val = await this.proxy.$readFile(uri);
        return new TextEncoder().encode(val);

    }
    async writeFile(uri: UriComponents, content: Uint8Array): Promise<void> {
        const encoded = new TextDecoder().decode(content);
        return this.proxy.$writeFile(uri, encoded);
    }

}
