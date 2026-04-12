#!/usr/bin/env node

import { Command } from 'commander';
import { listCommand } from './commands/list.js';
import { contentCommand } from './commands/content.js';
import { contentAllCommand } from './commands/content-all.js';
import { searchCommand } from './commands/search.js';
import { screenshotCommand } from './commands/screenshot.js';
import { openCommand } from './commands/open.js';
import { clickCommand } from './commands/click.js';
import { typeCommand } from './commands/type.js';
import { elementsCommand } from './commands/elements.js';
import { htmlCommand } from './commands/html.js';
import { descCommand } from './commands/desc.js';
import { closeCommand } from './commands/close.js';

const program = new Command();

program
  .name('browser')
  .description('CLI tool to interact with Chrome tabs via CDP')
  .version('1.0.0');

// Global options
program
  .option('-p, --port <number>', 'Chrome debugging port', '9222')
  .option('-h, --host <string>', 'Chrome debugging host', 'localhost');

// List command
program
  .command('list')
  .description('List all open Chrome tabs')
  .action(async () => {
    const opts = program.opts();
    await listCommand({
      port: parseInt(opts.port, 10),
      host: opts.host
    });
  });

// Content command
program
  .command('content <pattern>')
  .description('Get content from a tab by index, ID, or URL/title pattern')
  .option('-s, --selector <selector>', 'CSS selector to extract specific element')
  .action(async (pattern: string, cmdOpts: { selector?: string }) => {
    const opts = program.opts();
    await contentCommand(pattern, {
      port: parseInt(opts.port, 10),
      host: opts.host,
      selector: cmdOpts.selector
    });
  });

// Content-all command
program
  .command('content-all')
  .description('Get content from all open tabs')
  .action(async () => {
    const opts = program.opts();
    await contentAllCommand({
      port: parseInt(opts.port, 10),
      host: opts.host
    });
  });

// Search command
program
  .command('search <query>')
  .description('Search for text across all tabs')
  .action(async (query: string) => {
    const opts = program.opts();
    await searchCommand(query, {
      port: parseInt(opts.port, 10),
      host: opts.host
    });
  });

// Screenshot command
program
  .command('screenshot <pattern>')
  .description('Take a screenshot of a tab')
  .option('-o, --output <path>', 'Output file path')
  .action(async (pattern: string, cmdOpts: { output?: string }) => {
    const opts = program.opts();
    await screenshotCommand(pattern, {
      port: parseInt(opts.port, 10),
      host: opts.host,
      output: cmdOpts.output
    });
  });

// Open command
program
  .command('open <url>')
  .description('Open a URL in the browser')
  .option('-n, --new-tab', 'Open in a new tab')
  .action(async (url: string, cmdOpts: { newTab?: boolean }) => {
    const opts = program.opts();
    await openCommand(url, {
      port: parseInt(opts.port, 10),
      host: opts.host,
      newTab: cmdOpts.newTab
    });
  });

// Click command
program
  .command('click <tab> <selector>')
  .description('Click an element in a tab (by CSS selector or text content)')
  .action(async (tab: string, selector: string) => {
    const opts = program.opts();
    await clickCommand(tab, selector, {
      port: parseInt(opts.port, 10),
      host: opts.host
    });
  });

// Type command
program
  .command('type <tab> <text>')
  .description('Type text into an input field')
  .option('-s, --selector <selector>', 'CSS selector for the input element')
  .option('--submit', 'Submit the form after typing')
  .action(async (tab: string, text: string, cmdOpts: { selector?: string; submit?: boolean }) => {
    const opts = program.opts();
    await typeCommand(tab, text, {
      port: parseInt(opts.port, 10),
      host: opts.host,
      selector: cmdOpts.selector,
      submit: cmdOpts.submit
    });
  });

// Elements command
program
  .command('elements <tab>')
  .description('List interactive elements on a page')
  .option('-t, --type <type>', 'Element type: interactive, buttons, links, inputs')
  .action(async (tab: string, cmdOpts: { type?: string }) => {
    const opts = program.opts();
    await elementsCommand(tab, {
      port: parseInt(opts.port, 10),
      host: opts.host,
      type: cmdOpts.type
    });
  });

// HTML command
program
  .command('html <tab>')
  .description('Get HTML content from a tab (optionally from a specific selector)')
  .option('-s, --selector <selector>', 'CSS selector to extract specific element')
  .action(async (tab: string, cmdOpts: { selector?: string }) => {
    const opts = program.opts();
    await htmlCommand(tab, {
      port: parseInt(opts.port, 10),
      host: opts.host,
      selector: cmdOpts.selector
    });
  });

// Desc command - extract description from JSON-LD/meta tags
program
  .command('desc <tab>')
  .description('Get item description from JSON-LD schema or meta tags')
  .action(async (tab: string) => {
    const opts = program.opts();
    await descCommand(tab, {
      port: parseInt(opts.port, 10),
      host: opts.host
    });
  });

// Close command - close a tab
program
  .command('close <tab>')
  .description('Close a tab by index, ID, or pattern. Use "all" to close all but first tab.')
  .action(async (tab: string) => {
    const opts = program.opts();
    await closeCommand(tab, {
      port: parseInt(opts.port, 10),
      host: opts.host
    });
  });

program.parse();
